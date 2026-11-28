import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  createPermalinkSlug,
  isNormalizeStrategy,
  parsePregeneratedCsv,
  pregeneratedCsvTemplate,
  SLUG_GENERATION_ATTEMPTS,
  type ParticipantCsvRow,
  type PregeneratedCsvRow,
} from "@certificados/shared";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { readRoleCodes, validationFailed, type FieldDetail } from "../common/http";
import { EventAccess } from "../events/event-access";
import { planParticipantImport, type ImportIssue } from "../participants/csv-import";
import { csvBasename } from "../participants/multipart-file";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ensureEventRoleBadge } from "../badges/badge-sync";
import { importerMessage, pdfRejectedMessage } from "./import-messages";
import { inspectCertificateFile } from "./file-kind";
import { readCertificateZip } from "./zip-file";

const ONE_FILE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class PregeneratedService {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccess) private readonly events: EventAccess,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async templateCsv(eventId: string): Promise<string> {
    await this.events.visible(eventId);
    return pregeneratedCsvTemplate();
  }

  async importZip(eventId: string, csvBytes: Buffer, zipBytes: Buffer, filename: string, adminUserId: string, ipAddress: string | null) {
    const event = await this.events.visible(eventId);
    const text = decodeUtf8(csvBytes);
    if (text === null) {
      throw report([{ row: 0, field: "file", message: "El archivo tiene que estar en UTF-8." }]);
    }
    const parsed = parsePregeneratedCsv(text);
    if (!parsed.ok) {
      throw report(parsed.issues);
    }

    const issues: ImportIssue[] = [];
    const seenNames = new Set<string>();
    for (const row of parsed.rows) {
      const name = csvBasename(row.filename);
      if (!name || name !== row.filename) {
        issues.push({ row: row.row, field: "filename", message: "El nombre del archivo no puede llevar ruta.", value: row.filename });
        continue;
      }
      if (seenNames.has(name)) {
        issues.push({ row: row.row, field: "filename", message: "ZIP_DUPLICATE", value: name });
      }
      seenNames.add(name);
    }

    const zip = await readCertificateZip(zipBytes);
    if (!zip.ok) {
      throw report([...issues, ...zip.issues.map((issue) => ({ row: 0, field: issue.field, message: issue.message, value: issue.value }))]);
    }
    const files = new Map(zip.entries.map((entry) => [entry.name, entry.bytes]));
    for (const row of parsed.rows) {
      if (!files.has(row.filename)) {
        issues.push({ row: row.row, field: "filename", message: "ZIP_FILE_MISSING", value: row.filename });
      }
    }
    for (const name of files.keys()) {
      if (!parsed.rows.some((row) => row.filename === name)) {
        issues.push({ row: 0, field: "file", message: "ZIP_FILE_UNEXPECTED", value: name });
      }
    }

    const inspected = new Map<number, { bytes: Buffer; mimeType: string }>();
    for (const row of parsed.rows) {
      const bytes = files.get(row.filename);
      if (!bytes) {
        continue;
      }
      const file = await inspectCertificateFile(bytes);
      if (!file.ok) {
        issues.push({ row: row.row, field: "filename", message: file.message, value: row.filename });
        continue;
      }
      inspected.set(row.row, { bytes, mimeType: file.info.mimeType });
    }

    const planned = await this.plan(event.id, event.allowedRoles, parsed.rows.map(asParticipant));
    if (!planned.ok) {
      throw report([...issues, ...planned.issues]);
    }
    if (issues.length > 0) {
      throw report(issues);
    }

    const stored: { id: string; key: string; bytes: Buffer; mimeType: string; checksum: string; participantKey: string; role: string; venueId: string | null; activityTitle: string | null; activityKey: string }[] = [];
    for (const person of planned.people) {
      for (const certificate of person.certificates) {
        const file = inspected.get(certificate.sourceRow);
        if (!file) {
          throw report([{ row: 0, field: "file", message: "ZIP_FILE_MISSING" }]);
        }
        const checksum = createHash("sha256").update(file.bytes).digest("hex");
        const id = randomUUID();
        stored.push({
          id,
          key: `certs/${id}/${checksum}.${extensionFor(file.mimeType)}`,
          bytes: file.bytes,
          mimeType: file.mimeType,
          checksum,
          participantKey: person.key,
          role: certificate.roleCode,
          venueId: certificate.venueId,
          activityTitle: certificate.activityTitle,
          activityKey: certificate.activityKey,
        });
      }
    }

    const written: string[] = [];
    try {
      for (const file of stored) {
        await this.storage.put(file.key, file.bytes, file.mimeType);
        written.push(file.key);
      }
      return await this.prisma.$transaction(async (tx) => {
        const participantIds = new Map<string, string>();
        for (const person of planned.people) {
          const saved = person.existingId
            ? await tx.participant.update({
                where: { id: person.existingId },
                data: {
                  email: person.email,
                  venueId: person.venueId,
                  countryCode: person.document?.countryCode ?? null,
                  docTypeCode: person.document?.docTypeCode ?? null,
                  docNumber: person.document?.docNumber ?? null,
                },
              })
            : await tx.participant.create({
                data: {
                  eventId,
                  fullName: person.fullName,
                  email: person.email,
                  venueId: person.venueId,
                  countryCode: person.document?.countryCode ?? null,
                  docTypeCode: person.document?.docTypeCode ?? null,
                  docNumber: person.document?.docNumber ?? null,
                },
              });
          participantIds.set(person.key, saved.id);
          if (person.existingId && person.completedFields.length > 0) {
            await tx.auditLog.create({
              data: {
                adminUserId,
                action: "participant_update",
                entityType: "participant",
                entityId: saved.id,
                ipAddress,
                metadata: { fields: person.completedFields },
              },
            });
          }
        }
        for (const file of stored) {
          const record = await tx.storedFile.create({
            data: {
              storageKey: file.key,
              mimeType: file.mimeType,
              byteSize: BigInt(file.bytes.length),
              checksumSha256: file.checksum,
              uploadedById: adminUserId,
            },
          });
          await createPendingCertificate(tx, {
            id: file.id,
            participantId: participantIds.get(file.participantKey)!,
            eventId,
            roleCode: file.role,
            venueId: file.venueId,
            storedFileId: record.id,
            activityTitle: file.activityTitle,
            activityKey: file.activityKey,
          });
        }
        await tx.auditLog.create({
          data: {
            adminUserId,
            action: "pregenerated_import",
            entityType: "event",
            entityId: eventId,
            ipAddress,
            metadata: { row_count: parsed.rows.length, filename },
          },
        });
        return { rowCount: parsed.rows.length, participantCount: planned.people.length, certificateCount: stored.length };
      });
    } catch (error) {
      await Promise.all(written.map((key) => this.storage.delete(key).catch(() => undefined)));
      throw error;
    }
  }

  async attachFile(certificateId: string, bytes: Buffer, adminUserId: string) {
    if (bytes.length > ONE_FILE_BYTES) {
      throw validationFailed([{ field: "file", message: "El archivo supera 10 MB." }]);
    }
    const certificate = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { event: true, storedFile: true },
    });
    if (!certificate || certificate.event.deletedAt) {
      throw new NotFoundException();
    }
    if (certificate.mode !== "pregenerated") {
      throw validationFailed([{ field: "file", message: "Este certificado se genera desde la plantilla." }]);
    }
    if (certificate.status === "issued" || certificate.status === "revoked") {
      throw new ConflictException({
        statusCode: 409,
        error: "Conflict",
        message: "El archivo de un certificado emitido no se reemplaza.",
      });
    }
    const inspected = await inspectCertificateFile(bytes, ONE_FILE_BYTES);
    if (!inspected.ok) {
      const message = inspected.message === "UPLOAD_PDF_REJECTED" ? pdfRejectedMessage(0) : inspected.message;
      throw validationFailed([{ field: "file", message }]);
    }
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const storageKey = `certs/${certificate.id}/${checksum}.${extensionFor(inspected.info.mimeType)}`;
    await this.storage.put(storageKey, bytes, inspected.info.mimeType);
    try {
      const previous = certificate.storedFile;
      const saved = await this.prisma.$transaction(async (tx) => {
        const file = await tx.storedFile.create({
          data: {
            storageKey,
            mimeType: inspected.info.mimeType,
            byteSize: BigInt(bytes.length),
            checksumSha256: checksum,
            uploadedById: adminUserId,
          },
        });
        return tx.certificate.update({
          where: { id: certificate.id },
          data: {
            storedFileId: file.id,
            status: "pending",
            issueAttempts: 0,
            lastIssueError: null,
          },
        });
      });
      if (previous && previous.id !== saved.storedFileId) {
        await this.prisma.storedFile.delete({ where: { id: previous.id } }).catch(() => undefined);
        await this.storage.delete(previous.storageKey).catch(() => undefined);
      }
      return { id: saved.id, status: saved.status, mimeType: inspected.info.mimeType };
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  private async plan(eventId: string, allowedRoles: Prisma.JsonValue, rows: ParticipantCsvRow[]) {
    const roles = [...new Set(rows.map((row) => row.role.trim().toLowerCase()).filter((role) => role.length > 0))];
    const [catalog, venues, identity, existing] = await Promise.all([
      this.prisma.role.findMany({ where: { code: { in: roles }, isActive: true }, select: { code: true } }),
      this.prisma.venue.findMany({ where: { eventId }, select: { id: true, code: true } }),
      this.prisma.countryIdentityConfig.findMany(),
      this.prisma.participant.findMany({
        where: { eventId },
        include: { certificates: { select: { roleCode: true, status: true, activityKey: true, activityTitle: true } } },
      }),
    ]);
    return planParticipantImport({
      instance: this.env.INSTANCE,
      rows,
      allowedRoles: new Set(readRoleCodes(allowedRoles)),
      activeRoles: new Set(catalog.map((role) => role.code)),
      venues,
      pregeneratedOnly: true,
      defaultTemplateId: null,
      roleTemplateIds: new Map(),
      identityRules: new Map(
        identity.flatMap((rule) =>
          isNormalizeStrategy(rule.normalize)
            ? [[`${rule.countryCode.trim()}|${rule.docTypeCode}`, { normalize: rule.normalize, validationRegex: rule.validationRegex }] as const]
            : [],
        ),
      ),
      existing: existing.map((person) => ({
        id: person.id,
        email: person.email,
        fullName: person.fullName,
        activityTitle: person.activityTitle,
        venueId: person.venueId,
        erasedAt: person.erasedAt,
        countryCode: person.countryCode,
        docTypeCode: person.docTypeCode,
        docNumber: person.docNumber,
        liveCertificates: person.certificates
          .filter((certificate) => certificate.status !== "revoked")
          .map((certificate) => ({
            roleCode: certificate.roleCode,
            activityKey: certificate.activityKey,
            activityTitle: certificate.activityTitle,
          })),
      })),
    });
  }
}

function asParticipant(row: PregeneratedCsvRow): ParticipantCsvRow {
  return {
    row: row.row,
    fullName: row.fullName,
    email: row.email,
    countryCode: row.countryCode,
    docType: row.docType,
    docNumber: row.docNumber,
    role: row.role,
    activityTitle: row.activityTitle,
    venueCode: "",
  };
}

function decodeUtf8(bytes: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  return "pdf";
}

function report(issues: ImportIssue[]): BadRequestException {
  const shown: FieldDetail[] = issues.slice(0, 100).map((issue) => ({
    field: issue.field,
    message:
      issue.message === "UPLOAD_PDF_REJECTED" ? pdfRejectedMessage(issue.row, issue.value) : importerMessage(issue.message, issue.value),
    ...(issue.row > 0 ? { row: issue.row } : {}),
    ...(issue.value !== undefined ? { value: issue.value } : {}),
  }));
  return validationFailed(shown);
}

async function createPendingCertificate(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    participantId: string;
    eventId: string;
    roleCode: string;
    venueId: string | null;
    storedFileId: string;
    activityTitle: string | null;
    activityKey: string;
  },
): Promise<void> {
  for (let attempt = 0; attempt < SLUG_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const created = await tx.certificate.create({
        data: {
          id: input.id,
          participantId: input.participantId,
          eventId: input.eventId,
          roleCode: input.roleCode,
          slug: createPermalinkSlug(),
          status: "pending",
          mode: "pregenerated",
          venueId: input.venueId,
          storedFileId: input.storedFileId,
          activityTitle: input.activityTitle,
          activityKey: input.activityKey,
        },
      });
      await ensureEventRoleBadge(tx, created.id);
      return;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002" || !String(error.meta?.target ?? "").includes("slug")) {
        throw error;
      }
      if (attempt === SLUG_GENERATION_ATTEMPTS - 1) {
        throw error;
      }
    }
  }
}
