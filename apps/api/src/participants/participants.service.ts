import { BadRequestException, ConflictException, Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { Prisma, type Certificate } from "@prisma/client";
import {
  createPermalinkSlug,
  isNormalizeStrategy,
  parseParticipantCsv,
  parseParticipantIdentity,
  participantCsvTemplate,
  SLUG_GENERATION_ATTEMPTS,
} from "@certificados/shared";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { readRoleCodes, validationFailed } from "../common/http";
import { EventAccess } from "../events/event-access";
import { resolveCertificateTemplate, resolveVenueId } from "../events/event-rules";
import { PrismaService } from "../prisma/prisma.service";
import { planParticipantImport, type ImportIssue } from "./csv-import";
import { documentsConflict, normalizeDocument, type StoredDocument } from "./document-rules";

export type ParticipantBody = {
  fullName: string;
  email?: string;
  roles: string[];
  venueCode?: string;
  countryCode?: string;
  docTypeCode?: string;
  docNumber?: string;
  activityTitle?: string | null;
};

@Injectable()
export class ParticipantsService {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccess) private readonly events: EventAccess,
  ) {}

  async list(eventId: string, page: number, pageSize: number) {
    await this.events.visible(eventId);
    const where = { eventId, erasedAt: null };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.participant.count({ where }),
      this.prisma.participant.findMany({
        where,
        orderBy: [{ fullName: "asc" }, { email: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { certificates: { orderBy: { roleCode: "asc" } } },
      }),
    ]);
    return {
      items: rows.map((row) => this.toParticipant(row)),
      meta: { page, pageSize, total },
    };
  }

  async create(eventId: string, body: ParticipantBody) {
    const event = await this.events.visible(eventId);
    const roles = uniqueRoles(body.roles);
    const allowed = new Set(readRoleCodes(event.allowedRoles));
    const outside = roles.filter((role) => !allowed.has(role));
    if (outside.length > 0) {
      throw validationFailed([
        { field: "roles", message: `Roles fuera del evento: ${outside.join(", ")}.` },
      ]);
    }
    const catalog = await this.prisma.role.findMany({
      where: { code: { in: roles }, isActive: true },
      select: { code: true },
    });
    if (catalog.length !== roles.length) {
      throw validationFailed([{ field: "roles", message: "Hay un rol que no está en el catálogo activo." }]);
    }

    const venues = await this.prisma.venue.findMany({
      where: { eventId },
      select: { id: true, code: true },
    });
    const venue = resolveVenueId({ venueCode: body.venueCode, venues });
    if ("error" in venue) {
      throw validationFailed([{ field: "venueCode", message: "Esa sede no existe en el evento." }]);
    }

    const { email, document } = await this.resolveIdentity(body);
    const templates = await this.prisma.certificateTemplate.findMany({
      where: { eventId, roleCode: { in: roles } },
      select: { id: true, roleCode: true },
    });
    const planned = roles.map((roleCode) => {
      const resolved = resolveCertificateTemplate({
        pregeneratedOnly: event.pregeneratedOnly,
        defaultTemplateId: event.defaultTemplateId,
        roleTemplateId: templates.find((template) => template.roleCode === roleCode)?.id ?? null,
      });
      if ("error" in resolved) {
        throw validationFailed([
          {
            field: "roles",
            message: `No hay plantilla para el rol ${roleCode}. El evento generado no puede reservar ese certificado.`,
          },
        ]);
      }
      return { roleCode, ...resolved };
    });

    const existing = await this.prisma.participant.findFirst({
      where: email
        ? { eventId, email }
        : {
            eventId,
            email: null,
            countryCode: document?.countryCode,
            docTypeCode: document?.docTypeCode,
            docNumber: document?.docNumber,
          },
      include: { certificates: true },
    });
    if (existing?.erasedAt) {
      throw new ConflictException(
        email ? "Ese correo pertenece a un participante suprimido." : "Ese documento pertenece a un participante suprimido.",
      );
    }
    const storedDocument = storedDoc(existing);
    if (documentsConflict(storedDocument, document)) {
      throw validationFailed([
        { field: "docNumber", message: "El documento no coincide con el que ya tiene este correo." },
      ]);
    }
    const liveRoles = new Set(
      (existing?.certificates ?? [])
        .filter((certificate) => certificate.status !== "revoked")
        .map((certificate) => certificate.roleCode),
    );
    const duplicated = planned.filter((item) => liveRoles.has(item.roleCode));
    if (duplicated.length > 0) {
      throw validationFailed([
        {
          field: "roles",
          message: `${email ? "Este correo" : "Este documento"} ya tiene certificado para: ${duplicated.map((item) => item.roleCode).join(", ")}.`,
        },
      ]);
    }

    const participant = await this.prisma.$transaction(async (tx) => {
      const person = existing
        ? await tx.participant.update({
            where: { id: existing.id },
            data: {
              fullName: body.fullName,
              activityTitle: body.activityTitle === undefined ? existing.activityTitle : body.activityTitle,
              venueId: venue.venueId ?? existing.venueId,
              countryCode: document?.countryCode ?? existing.countryCode,
              docTypeCode: document?.docTypeCode ?? existing.docTypeCode,
              docNumber: document?.docNumber ?? existing.docNumber,
            },
          })
        : await tx.participant.create({
            data: {
              eventId,
              fullName: body.fullName,
              email,
              activityTitle: body.activityTitle ?? null,
              venueId: venue.venueId,
              countryCode: document?.countryCode ?? null,
              docTypeCode: document?.docTypeCode ?? null,
              docNumber: document?.docNumber ?? null,
            },
          });

      for (const item of planned) {
        await createCertificate(tx, {
          participantId: person.id,
          eventId,
          roleCode: item.roleCode,
          mode: item.mode,
          templateId: item.templateId,
          venueId: venue.venueId,
        });
      }
      return tx.participant.findUniqueOrThrow({
        where: { id: person.id },
        include: { certificates: { orderBy: { roleCode: "asc" } } },
      });
    });
    return this.toParticipant(participant);
  }

  async importCsv(eventId: string, bytes: Buffer, filename: string, adminUserId: string, ipAddress: string | null) {
    const event = await this.events.visible(eventId);
    if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
      throw report([{ row: 0, field: "file", message: "Sube un CSV. Las hojas de Excel u ODS no se importan." }]);
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw report([{ row: 0, field: "file", message: "El archivo tiene que estar en UTF-8." }]);
    }
    const parsed = parseParticipantCsv(text);
    if (!parsed.ok) {
      throw report(parsed.issues);
    }

    const roles = [...new Set(parsed.rows.map((row) => row.role.trim().toLowerCase()).filter((role) => role.length > 0))];
    const [catalog, venues, templates, identity, existing] = await Promise.all([
      this.prisma.role.findMany({ where: { code: { in: roles }, isActive: true }, select: { code: true } }),
      this.prisma.venue.findMany({ where: { eventId }, select: { id: true, code: true } }),
      this.prisma.certificateTemplate.findMany({
        where: { eventId, roleCode: { not: null } },
        select: { id: true, roleCode: true },
      }),
      this.prisma.countryIdentityConfig.findMany(),
      this.prisma.participant.findMany({
        where: { eventId },
        include: { certificates: { select: { roleCode: true, status: true } } },
      }),
    ]);
    const planned = planParticipantImport({
      instance: this.env.INSTANCE,
      rows: parsed.rows,
      allowedRoles: new Set(readRoleCodes(event.allowedRoles)),
      activeRoles: new Set(catalog.map((role) => role.code)),
      venues,
      pregeneratedOnly: event.pregeneratedOnly,
      defaultTemplateId: event.defaultTemplateId,
      roleTemplateIds: new Map(
        templates.flatMap((template) => (template.roleCode ? [[template.roleCode, template.id] as const] : [])),
      ),
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
        roles: person.certificates.filter((certificate) => certificate.status !== "revoked").map((certificate) => certificate.roleCode),
      })),
    });
    if (!planned.ok) {
      throw report(planned.issues);
    }

    const imported = await this.prisma.$transaction(async (tx) => {
      let certificates = 0;
      for (const person of planned.people) {
        const saved = person.existingId
          ? await tx.participant.update({
              where: { id: person.existingId },
              data: {
                fullName: person.fullName,
                activityTitle: person.activityTitle,
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
                activityTitle: person.activityTitle,
                venueId: person.venueId,
                countryCode: person.document?.countryCode ?? null,
                docTypeCode: person.document?.docTypeCode ?? null,
                docNumber: person.document?.docNumber ?? null,
              },
            });
        for (const certificate of person.certificates) {
          await createCertificate(tx, {
            participantId: saved.id,
            eventId,
            roleCode: certificate.roleCode,
            mode: certificate.mode,
            templateId: certificate.templateId,
            venueId: certificate.venueId,
          });
          certificates += 1;
        }
      }
      await tx.auditLog.create({
        data: {
          adminUserId,
          action: "participant_csv_import",
          entityType: "event",
          entityId: eventId,
          ipAddress,
          metadata: { row_count: parsed.rows.length, filename },
        },
      });
      return { rowCount: parsed.rows.length, participantCount: planned.people.length, certificateCount: certificates };
    });
    return imported;
  }

  async templateCsv(eventId: string): Promise<string> {
    await this.events.visible(eventId);
    return participantCsvTemplate();
  }

  private async resolveIdentity(body: ParticipantBody): Promise<{ email: string | null; document: StoredDocument | null }> {
    const identity = parseParticipantIdentity({
      email: body.email,
      countryCode: body.countryCode,
      docTypeCode: body.docTypeCode,
      docNumber: body.docNumber,
    });
    if (!identity.ok) {
      throw validationFailed(identity.issues);
    }
    if (!identity.document) {
      if (this.env.INSTANCE === "ac3") {
        throw validationFailed([{ field: "docNumber", message: "En AC3 el documento es obligatorio." }]);
      }
      return { email: identity.email, document: null };
    }
    const rule = await this.prisma.countryIdentityConfig.findUnique({
      where: {
        countryCode_docTypeCode: {
          countryCode: identity.document.countryCode,
          docTypeCode: identity.document.docTypeCode,
        },
      },
    });
    const normalized = normalizeDocument(identity.document, rule);
    if (!normalized.ok) {
      throw validationFailed([{ field: normalized.field, message: normalized.message }]);
    }
    return { email: identity.email, document: normalized.value };
  }

  private toParticipant(row: {
    id: string;
    eventId: string;
    fullName: string;
    email: string | null;
    activityTitle: string | null;
    countryCode: string | null;
    docTypeCode: string | null;
    docNumber: string | null;
    venueId: string | null;
    createdAt: Date;
    certificates: Certificate[];
  }) {
    return {
      id: row.id,
      eventId: row.eventId,
      fullName: row.fullName,
      email: row.email,
      activityTitle: row.activityTitle,
      countryCode: row.countryCode?.trim() ?? null,
      docTypeCode: row.docTypeCode,
      docNumber: row.docNumber,
      venueId: row.venueId,
      createdAt: row.createdAt.toISOString(),
      certificates: row.certificates.map((certificate) => ({
        id: certificate.id,
        roleCode: certificate.roleCode,
        slug: certificate.slug,
        status: certificate.status,
        issueAttempts: certificate.issueAttempts,
        mode: certificate.mode,
        templateId: certificate.templateId,
        venueId: certificate.venueId,
      })),
    };
  }
}

function report(issues: ImportIssue[]): BadRequestException {
  const shown = issues.slice(0, 100).map((issue) => ({
    field: issue.field,
    message: issue.message,
    ...(issue.row > 0 ? { row: issue.row } : {}),
    ...(issue.value !== undefined ? { value: issue.value } : {}),
  }));
  if (issues.length > shown.length) {
    shown.push({ field: "file", message: `Hay ${issues.length} errores. Se muestran los primeros 100.` });
  }
  return validationFailed(shown);
}

function uniqueRoles(roles: string[]): string[] {
  const unique = [...new Set(roles)];
  if (unique.length !== roles.length) {
    throw validationFailed([{ field: "roles", message: "Los roles del alta vienen repetidos." }]);
  }
  return unique;
}

function storedDoc(existing: {
  countryCode: string | null;
  docTypeCode: string | null;
  docNumber: string | null;
} | null): StoredDocument | null {
  if (!existing?.countryCode || !existing.docTypeCode || !existing.docNumber) {
    return null;
  }
  return {
    countryCode: existing.countryCode.trim(),
    docTypeCode: existing.docTypeCode,
    docNumber: existing.docNumber,
  };
}

async function createCertificate(
  tx: Prisma.TransactionClient,
  input: {
    participantId: string;
    eventId: string;
    roleCode: string;
    mode: "generated" | "pregenerated";
    templateId: string | null;
    venueId: string | null;
  },
): Promise<void> {
  for (let attempt = 0; attempt < SLUG_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      await tx.certificate.create({
        data: {
          participantId: input.participantId,
          eventId: input.eventId,
          roleCode: input.roleCode,
          slug: createPermalinkSlug(),
          status: "pending",
          mode: input.mode,
          templateId: input.templateId,
          venueId: input.venueId,
        },
      });
      return;
    } catch (error) {
      if (!isSlugCollision(error) || attempt === SLUG_GENERATION_ATTEMPTS - 1) {
        if (isSlugCollision(error)) {
          throw new InternalServerErrorException({
            statusCode: 500,
            error: "Internal Server Error",
            message: "SLUG_COLLISION",
          });
        }
        throw error;
      }
    }
  }
}

function isSlugCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = String(error.meta?.target ?? "");
  return target.includes("slug");
}
