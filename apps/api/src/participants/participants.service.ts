import { BadRequestException, Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { Prisma, type Certificate } from "@prisma/client";
import {
  createPermalinkSlug,
  isNormalizeStrategy,
  parseParticipantCsv,
  participantCsvTemplate,
  SLUG_GENERATION_ATTEMPTS,
  type ParticipantCsvRow,
} from "@certificados/shared";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { readRoleCodes, validationFailed } from "../common/http";
import { EventAccess } from "../events/event-access";
import { resolveCertificateTemplate, resolveVenueId } from "../events/event-rules";
import { PrismaService } from "../prisma/prisma.service";
import { ensureEventRoleBadge } from "../badges/badge-sync";
import { planParticipantImport, type ImportIssue } from "./csv-import";

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

  async create(eventId: string, body: ParticipantBody, audit?: { adminUserId: string; ipAddress: string | null }) {
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

    const templates = await this.prisma.certificateTemplate.findMany({
      where: { eventId, roleCode: { in: roles } },
      select: { id: true, roleCode: true },
    });
    for (const roleCode of roles) {
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
    }

    const planned = await this.planForEvent(
      event,
      roles.map((role) => ({
        row: 0,
        fullName: body.fullName.trim(),
        email: body.email ?? "",
        countryCode: body.countryCode ?? "",
        docType: body.docTypeCode ?? "",
        docNumber: body.docNumber ?? "",
        role,
        activityTitle: body.activityTitle ?? "",
        venueCode: body.venueCode ?? "",
      })),
    );
    if (!planned.ok) {
      throw validationFailed(planned.issues.map((issue) => ({
        field: INDIVIDUAL_FIELDS[issue.field] ?? issue.field,
        message: issue.message,
        ...(issue.value !== undefined ? { value: issue.value } : {}),
      })));
    }
    const person = planned.people[0];
    if (!person || planned.people.length !== 1) {
      throw validationFailed([{ field: "email", message: "No se pudo identificar a la persona." }]);
    }

    const participant = await this.prisma.$transaction(async (tx) => {
      const saved = person.existingId
        ? await tx.participant.update({
            where: { id: person.existingId },
            data: {
              email: person.email,
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
          activityTitle: certificate.activityTitle,
          activityKey: certificate.activityKey,
        });
      }
      if (person.existingId && person.completedFields.length > 0 && audit) {
        await tx.auditLog.create({
          data: {
            adminUserId: audit.adminUserId,
            action: "participant_update",
            entityType: "participant",
            entityId: saved.id,
            ipAddress: audit.ipAddress,
            metadata: { fields: person.completedFields },
          },
        });
      }
      return tx.participant.findUniqueOrThrow({
        where: { id: saved.id },
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

    const planned = await this.planForEvent(event, parsed.rows);
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
                email: person.email,
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
            activityTitle: certificate.activityTitle,
            activityKey: certificate.activityKey,
          });
          certificates += 1;
        }
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

  private async planForEvent(
    event: { id: string; allowedRoles: Prisma.JsonValue; pregeneratedOnly: boolean; defaultTemplateId: string | null },
    rows: ParticipantCsvRow[],
  ) {
    const roles = [...new Set(rows.map((row) => row.role.trim().toLowerCase()).filter((role) => role.length > 0))];
    const [catalog, venues, templates, identity, existing] = await Promise.all([
      this.prisma.role.findMany({ where: { code: { in: roles }, isActive: true }, select: { code: true } }),
      this.prisma.venue.findMany({ where: { eventId: event.id }, select: { id: true, code: true } }),
      this.prisma.certificateTemplate.findMany({
        where: { eventId: event.id, roleCode: { not: null } },
        select: { id: true, roleCode: true },
      }),
      this.prisma.countryIdentityConfig.findMany(),
      this.prisma.participant.findMany({
        where: { eventId: event.id },
        include: { certificates: { select: { roleCode: true, status: true, activityKey: true, activityTitle: true } } },
      }),
    ]);
    return planParticipantImport({
      instance: this.env.INSTANCE,
      rows,
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

  async templateCsv(eventId: string): Promise<string> {
    await this.events.visible(eventId);
    return participantCsvTemplate();
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
        activityTitle: certificate.activityTitle,
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

const INDIVIDUAL_FIELDS: Record<string, string> = {
  full_name: "fullName",
  doc_number: "docNumber",
  doc_type: "docTypeCode",
  country_code: "countryCode",
  role: "roles",
  venue_code: "venueCode",
  activity_title: "activityTitle",
};

async function createCertificate(
  tx: Prisma.TransactionClient,
  input: {
    participantId: string;
    eventId: string;
    roleCode: string;
    mode: "generated" | "pregenerated";
    templateId: string | null;
    venueId: string | null;
    activityTitle: string | null;
    activityKey: string;
  },
): Promise<void> {
  for (let attempt = 0; attempt < SLUG_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const created = await tx.certificate.create({
        data: {
          participantId: input.participantId,
          eventId: input.eventId,
          roleCode: input.roleCode,
          slug: createPermalinkSlug(),
          status: "pending",
          mode: input.mode,
          templateId: input.templateId,
          venueId: input.venueId,
          activityTitle: input.activityTitle,
          activityKey: input.activityKey,
        },
      });
      await ensureEventRoleBadge(tx, created.id);
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
