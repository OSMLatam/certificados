import { createHash } from "node:crypto";
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, type Certificate, type Participant } from "@prisma/client";
import { parseCertificateLayout, type CertificateLayout } from "@certificados/shared";
import QRCode from "qrcode";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { formatDateOnly } from "../common/http";
import { certificateFontFaceCss } from "../pdf/font-face";
import { renderCertificateHtml, type CertificateValues } from "../pdf/certificate-html";
import { inspectImage } from "../templates/image-file";
import { issueErrorCode, nextIssueState } from "../pdf/issue-state";
import { isPreviewBot } from "../pdf/preview-bot";
import { markEventRoleBadgeIssued, revokeEventRoleBadge } from "../badges/badge-sync";
import { captureLegalSnapshot, reserveAc3Folio } from "../legal/legal-issue";
import { issueDateLabel, legalTextValues, type LegalSnapshot } from "../legal/legal-snapshot";
import { maskDocument } from "./mask-document";
import { PdfService } from "../pdf/pdf.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

const certificateInclude = {
  participant: true,
  event: true,
  venue: true,
  template: { include: { backgroundFile: true } },
  storedFile: true,
} satisfies Prisma.CertificateInclude;

type Loaded = Prisma.CertificateGetPayload<{ include: typeof certificateInclude }>;

export type PublicCertificate = {
  slug: string;
  status: Certificate["status"];
  fullName: string | null;
  eventName: string | null;
  roleLabel: string | null;
  eventDate: string | null;
  venueName: string | null;
  activityTitle: string | null;
  issuer: string | null;
  issuedAt: string | null;
  revokedAt: string | null;
  checksumSha256: string | null;
  documentMasked: string | null;
  permalink: string;
  legal: PublicLegal | null;
};

export type PublicLegal = {
  entityName: string;
  nit: string;
  representative: string;
  issueCity: string;
  issueDate: string;
  disclaimer: string;
  folio: string;
  signers: { slot: number; name: string; title: string }[];
};

@Injectable()
export class IssueService {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(PdfService) private readonly pdf: PdfService,
  ) {}

  async metadata(slug: string, userAgent: string | undefined, referer: string | undefined): Promise<PublicCertificate> {
    const certificate = await this.find(slug);
    await this.logAccess(certificate.id, userAgent, referer);
    if (certificate.status !== "pending" || isPreviewBot(userAgent, this.env.PREVIEW_BOT_UA_REGEX)) {
      return this.toPublic(certificate);
    }
    return this.transitionToIssued(certificate.id);
  }

  async file(slug: string): Promise<{ body: Buffer; mimeType: string; filename: string }> {
    const certificate = await this.find(slug);
    if (certificate.status === "revoked") {
      throw new NotFoundException();
    }
    if (certificate.status !== "issued" || !certificate.storedFile) {
      throw new ConflictException({
        statusCode: 409,
        error: "Conflict",
        message: "El archivo todavía no está disponible.",
      });
    }
    const body = await this.storage.get(certificate.storedFile.storageKey);
    const extension =
      certificate.storedFile.mimeType === "application/pdf"
        ? "pdf"
        : certificate.storedFile.mimeType === "image/png"
          ? "png"
          : certificate.storedFile.mimeType === "image/jpeg"
            ? "jpg"
            : "bin";
    return { body, mimeType: certificate.storedFile.mimeType, filename: `${slug}.${extension}` };
  }

  async revoke(
    adminUserId: string,
    id: string,
    revokeReason: string | undefined,
    ipAddress: string | null,
  ): Promise<{ id: string; status: "revoked" }> {
    const reason = revokeReason?.trim() ?? "";
    const result = await this.prisma.$transaction(async (tx) => {
      const certificate = await tx.certificate.findUnique({ where: { id } });
      if (!certificate) {
        return { error: "missing" as const };
      }
      if (certificate.status === "revoked") {
        return { error: "status" as const };
      }
      const when = new Date();
      await tx.certificate.update({
        where: { id },
        data: { status: "revoked", revokedAt: when, revokeReason: reason || null },
      });
      await revokeEventRoleBadge(tx, id, reason, when);
      await tx.auditLog.create({
        data: {
          adminUserId,
          action: "certificate_revoke",
          entityType: "certificate",
          entityId: id,
          ipAddress,
          metadata: reason ? { revoke_reason: reason } : {},
        },
      });
      return { error: null };
    });
    if (result.error === "missing") {
      throw new NotFoundException();
    }
    if (result.error === "status") {
      throw new ConflictException({
        statusCode: 409,
        error: "Conflict",
        message: "Ese certificado ya está revocado.",
      });
    }
    return { id, status: "revoked" };
  }

  async retry(adminUserId: string, id: string, ipAddress: string | null): Promise<{ id: string; status: "pending" }> {
    const result = await this.prisma.$transaction(async (tx) => {
      await lockCertificate(tx, id);
      const certificate = await tx.certificate.findUnique({ where: { id } });
      if (!certificate) {
        return { error: "missing" as const };
      }
      if (certificate.status !== "failed") {
        return { error: "status" as const };
      }
      await tx.certificate.update({
        where: { id },
        data: { status: "pending", issueAttempts: 0, lastIssueError: null },
      });
      await tx.auditLog.create({
        data: {
          adminUserId,
          action: "certificate_retry_issue",
          entityType: "certificate",
          entityId: id,
          ipAddress,
          metadata: { previous_attempts: certificate.issueAttempts },
        },
      });
      return { error: null };
    });
    if (result.error === "missing") {
      throw new NotFoundException();
    }
    if (result.error === "status") {
      throw new ConflictException({
        statusCode: 409,
        error: "Conflict",
        message: "Solo un certificado fallido se puede reintentar.",
      });
    }
    return { id, status: "pending" };
  }

  private async transitionToIssued(id: string): Promise<PublicCertificate> {
    try {
      if (this.env.INSTANCE === "ac3") {
        await reserveAc3Folio(this.prisma, id);
      }
      const certificate = await this.prisma.$transaction(
        async (tx) => {
          await lockCertificate(tx, id);
          const current = await tx.certificate.findUniqueOrThrow({ where: { id }, include: certificateInclude });
          if (current.status !== "pending") {
            return current;
          }
          const issuedAtCandidate = new Date();
          const snapshot =
            this.env.INSTANCE === "ac3" && current.folio !== null
              ? await captureLegalSnapshot(tx, current.folio, issuedAtCandidate)
              : null;
          if (current.mode === "pregenerated") {
            if (!current.storedFileId) {
              throw new Error("PREGENERATED_FILE_MISSING");
            }
            const issued = await tx.certificate.update({
              where: { id },
              data: {
                status: "issued",
                issuedAt: issuedAtCandidate,
                lastIssueError: null,
                legalSnapshot: snapshot === null ? undefined : (snapshot as Prisma.InputJsonValue),
              },
              include: certificateInclude,
            });
            await markEventRoleBadgeIssued(tx, id, issuedAtCandidate);
            return issued;
          }
          const html = await this.buildHtml(tx, current, snapshot);
          const pdf = await this.pdf.render(html);
          if (!pdf.subarray(0, 4).equals(Buffer.from("%PDF"))) {
            throw new Error("PDF_RENDER");
          }
          const checksum = createHash("sha256").update(pdf).digest("hex");
          const storageKey = `certs/${current.id}/${checksum}.pdf`;
          await this.storage.put(storageKey, pdf, "application/pdf");
          try {
            const file = await tx.storedFile.create({
              data: {
                storageKey,
                mimeType: "application/pdf",
                byteSize: BigInt(pdf.length),
                checksumSha256: checksum,
              },
            });
            const issued = await tx.certificate.update({
              where: { id },
              data: {
                status: "issued",
                issuedAt: issuedAtCandidate,
                storedFileId: file.id,
                issueAttempts: current.issueAttempts + 1,
                lastIssueError: null,
                lastIssueAttemptAt: issuedAtCandidate,
                legalSnapshot: snapshot === null ? undefined : (snapshot as Prisma.InputJsonValue),
              },
              include: certificateInclude,
            });
            await markEventRoleBadgeIssued(tx, id, issuedAtCandidate);
            return issued;
          } catch (error) {
            await this.storage.delete(storageKey).catch(() => undefined);
            throw error;
          }
        },
        { timeout: this.env.PDF_TIMEOUT_MS * 2 + 20_000, maxWait: 15_000 },
      );
      return this.toPublic(certificate);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const status = await this.recordFailure(id, error);
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: "Service Unavailable",
        message:
          status === "failed"
            ? "No se pudo generar el certificado."
            : "El certificado se está generando. Inténtalo de nuevo.",
      });
    }
  }

  private async recordFailure(id: string, error: unknown): Promise<"pending" | "failed"> {
    return this.prisma.$transaction(async (tx) => {
      await lockCertificate(tx, id);
      const current = await tx.certificate.findUnique({ where: { id } });
      if (!current || current.status !== "pending") {
        return current?.status === "failed" ? "failed" : "pending";
      }
      const next = nextIssueState(current.issueAttempts, this.env.PDF_MAX_ISSUE_ATTEMPTS);
      await tx.certificate.update({
        where: { id },
        data: {
          status: next.status,
          issueAttempts: next.issueAttempts,
          lastIssueError: issueErrorCode(error),
          lastIssueAttemptAt: new Date(),
        },
      });
      return next.status;
    });
  }

  private async buildHtml(tx: Prisma.TransactionClient, certificate: Loaded, snapshot: LegalSnapshot | null): Promise<string> {
    if (!certificate.template) {
      throw new Error("TEMPLATE_MISSING");
    }
    const parsed = parseCertificateLayout(certificate.template.layout);
    if (!parsed.ok) {
      throw new Error("PDF_RENDER");
    }
    const role = await tx.role.findUnique({ where: { code: certificate.roleCode } });
    const values = certificateValues(
      certificate,
      role?.label ?? certificate.roleCode,
      this.permalink(certificate.slug),
      snapshot ? legalTextValues(snapshot, false) : {},
    );
    const qrSvg = await qrSvgFor(values.permalink, qrSize(parsed.layout));
    return renderCertificateHtml({
      layout: parsed.layout,
      values,
      qrSvg,
      fontFaceCss: certificateFontFaceCss(),
      backgroundDataUri: await this.backgroundUri(certificate),
    });
  }

  private async backgroundUri(certificate: Loaded): Promise<string | undefined> {
    const file = certificate.template?.backgroundFile;
    if (!file) {
      return undefined;
    }
    const bytes = await this.storage.get(file.storageKey);
    const image = inspectImage(bytes);
    if (!image.ok) {
      throw new Error("PDF_RENDER");
    }
    return `data:${image.info.mimeType};base64,${bytes.toString("base64")}`;
  }

  private async find(slug: string): Promise<Loaded> {
    const certificate = await this.prisma.certificate.findUnique({ where: { slug }, include: certificateInclude });
    if (!certificate) {
      throw new NotFoundException();
    }
    return certificate;
  }

  private async toPublic(certificate: Loaded): Promise<PublicCertificate> {
    const revoked = certificate.status === "revoked";
    const issued = certificate.status === "issued";
    const role = revoked ? null : await this.prisma.role.findUnique({ where: { code: certificate.roleCode } });
    const when = certificate.venue?.eventDate ?? certificate.event.startDate;
    return {
      slug: certificate.slug,
      status: certificate.status,
      fullName: revoked ? null : certificate.participant.fullName,
      eventName: revoked ? null : certificate.event.name,
      roleLabel: revoked ? null : role?.label ?? certificate.roleCode,
      eventDate: revoked ? null : formatDateOnly(when),
      venueName: revoked ? null : certificate.venue?.name ?? null,
      activityTitle: revoked ? null : certificate.activityTitle ?? certificate.participant.activityTitle,
      issuer: revoked ? null : this.env.SITE_NAME,
      issuedAt: issued && certificate.issuedAt ? certificate.issuedAt.toISOString() : null,
      revokedAt: revoked && certificate.revokedAt ? certificate.revokedAt.toISOString() : null,
      checksumSha256: issued ? certificate.storedFile?.checksumSha256.trim() ?? null : null,
      documentMasked: revoked ? null : maskDocument(certificate.participant.docTypeCode, certificate.participant.docNumber),
      permalink: this.permalink(certificate.slug),
      legal: issued && !revoked ? publicLegal(certificate.legalSnapshot) : null,
    };
  }

  private permalink(slug: string): string {
    return `${this.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/c/${slug}`;
  }

  private async logAccess(certificateId: string, userAgent: string | undefined, referer: string | undefined): Promise<void> {
    await this.prisma.permalinkAccessLog.create({
      data: {
        certificateId,
        userAgent: userAgent?.slice(0, 500) ?? null,
        referer: referer?.slice(0, 500) ?? null,
      },
    });
  }
}

function publicLegal(value: Prisma.JsonValue | null): PublicLegal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.nit !== "string" && typeof row.entity_name !== "string") {
    return null;
  }
  const signers = Array.isArray(row.signers)
    ? row.signers.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const signer = item as Record<string, unknown>;
        if (typeof signer.slot !== "number" || typeof signer.name !== "string") {
          return [];
        }
        return [{ slot: signer.slot, name: signer.name, title: typeof signer.title === "string" ? signer.title : "" }];
      })
    : [];
  return {
    entityName: typeof row.entity_name === "string" ? row.entity_name : "",
    nit: typeof row.nit === "string" ? row.nit : "",
    representative: typeof row.representative === "string" ? row.representative : "",
    issueCity: typeof row.issue_city === "string" ? row.issue_city : "",
    issueDate: typeof row.issued_at === "string" ? issueDateLabel(new Date(row.issued_at)) : "",
    disclaimer: typeof row.disclaimer === "string" ? row.disclaimer : "",
    folio: typeof row.folio === "number" ? String(row.folio) : "",
    signers,
  };
}

function certificateValues(
  certificate: Loaded,
  roleLabel: string,
  permalink: string,
  legal: Record<string, string>,
): CertificateValues {
  const when = certificate.venue?.eventDate ?? certificate.event.startDate;
  return {
    full_name: certificate.participant.fullName,
    document: documentLabel(certificate.participant),
    role_label: roleLabel,
    activity_title: certificate.activityTitle ?? certificate.participant.activityTitle ?? "",
    event_name: certificate.event.name,
    venue_name: certificate.venue?.name ?? "",
    event_date: formatEventDate(when),
    certificate_slug: permalink,
    permalink,
    ...legal,
  };
}

function documentLabel(participant: Participant): string {
  if (!participant.docTypeCode || !participant.docNumber) {
    return "";
  }
  return `${participant.docTypeCode.trim()} ${participant.docNumber}`;
}

function formatEventDate(value: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function qrSize(layout: CertificateLayout): number {
  const qr = layout.layers.find((layer) => layer.field === "permalink_qr");
  return qr && qr.field === "permalink_qr" ? qr.size : 150;
}

async function qrSvgFor(permalink: string, size: number): Promise<string> {
  const svg = await QRCode.toString(permalink, { type: "svg", margin: 0, width: size });
  return svg
    .replace(/<\?xml[\s\S]*?\?>/, "")
    .replace(/<!DOCTYPE[^>]*>/g, "")
    .replace(/<title[\s\S]*?<\/title>/g, "")
    .replace(/<desc[\s\S]*?<\/desc>/g, "")
    .trim();
}

async function lockCertificate(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRawUnsafe(`SELECT id FROM certificates WHERE id = $1::uuid FOR UPDATE`, id);
}
