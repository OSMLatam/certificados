import { createHash } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  buildTemplatePackage,
  layoutHasLegal,
  minimalCertificateLayout,
  parseCertificateLayout,
  parseTemplatePackage,
  type CertificateLayout,
} from "@certificados/shared";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { readRoleCodes, validationFailed } from "../common/http";
import { EventAccess } from "../events/event-access";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { inspectImage } from "./image-file";
import { readTemplateArchive } from "./template-archive";
import { writeStoredZip } from "./stored-zip";

export type TemplateBody = {
  name: string;
  roleCode?: string | null;
  layout?: unknown;
};

@Injectable()
export class TemplatesService {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccess) private readonly events: EventAccess,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async list(eventId: string) {
    const event = await this.events.visible(eventId);
    const templates = await this.prisma.certificateTemplate.findMany({
      where: { eventId },
      orderBy: [{ roleCode: "asc" }, { name: "asc" }],
    });
      return {
        items: templates.map((template) => this.toTemplate(template, event.defaultTemplateId)),
      };
    }

  async updateLayout(eventId: string, templateId: string, layout: unknown) {
    const event = await this.events.visible(eventId);
    const template = await this.findTemplate(eventId, templateId);
    const parsed = this.parseLayout(layout);
    const updated = await this.prisma.certificateTemplate.update({
      where: { id: template.id },
      data: { layout: parsed as Prisma.InputJsonValue },
    });
    return this.toTemplate(updated, event.defaultTemplateId);
  }

  async setBackground(eventId: string, templateId: string, bytes: Buffer, adminUserId: string) {
    const event = await this.events.visible(eventId);
    const template = await this.findTemplate(eventId, templateId);
    const image = inspectImage(bytes);
    if (!image.ok) {
      throw validationFailed([{ field: "file", message: image.message }]);
    }
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const extension = image.info.mimeType === "image/png" ? "png" : "jpg";
    const storageKey = `backgrounds/${template.id}/${checksum}.${extension}`;
    await this.storage.put(storageKey, bytes, image.info.mimeType);
    try {
      const file = await this.prisma.storedFile.create({
        data: {
          storageKey,
          mimeType: image.info.mimeType,
          byteSize: BigInt(bytes.length),
          checksumSha256: checksum,
          uploadedById: adminUserId,
        },
      });
      const updated = await this.prisma.certificateTemplate.update({
        where: { id: template.id },
        data: { backgroundFileId: file.id },
      });
      if (template.backgroundFileId && template.backgroundFileId !== file.id) {
        await this.deleteStoredFile(template.backgroundFileId);
      }
      return this.toTemplate(updated, event.defaultTemplateId);
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async readBackground(eventId: string, templateId: string): Promise<{ body: Buffer; mimeType: string }> {
    await this.events.visible(eventId);
    const template = await this.prisma.certificateTemplate.findFirst({
      where: { id: templateId, eventId },
      include: { backgroundFile: true },
    });
    if (!template?.backgroundFile) {
      throw new NotFoundException();
    }
    const body = await this.storage.get(template.backgroundFile.storageKey);
    return { body, mimeType: template.backgroundFile.mimeType };
  }

  async create(eventId: string, body: TemplateBody) {
    const event = await this.events.visible(eventId);
    if (event.pregeneratedOnly) {
      throw validationFailed([
        { field: "layout", message: "Un evento de certificados ya hechos no usa plantilla." },
      ]);
    }
    const layout = this.parseLayout(body.layout === undefined ? minimalCertificateLayout() : body.layout);
    const roleCode = body.roleCode ?? null;
    if (roleCode) {
      await this.ensureRole(event.allowedRoles, roleCode);
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const template = await tx.certificateTemplate.create({
          data: {
            eventId,
            roleCode,
            name: body.name,
            layout: layout as Prisma.InputJsonValue,
          },
        });
        const becomesDefault = roleCode === null && event.defaultTemplateId === null;
        if (becomesDefault) {
          await tx.event.update({ where: { id: eventId }, data: { defaultTemplateId: template.id } });
        }
        return this.toTemplate(template, becomesDefault ? template.id : event.defaultTemplateId);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw validationFailed([
          { field: "roleCode", message: "Ese evento ya tiene una plantilla para ese rol." },
        ]);
      }
      throw error;
    }
  }

  async exportPackage(eventId: string, templateId: string, adminUserId: string, ipAddress: string | null) {
    const event = await this.events.visible(eventId);
    const template = await this.prisma.certificateTemplate.findFirst({
      where: { id: templateId, eventId },
      include: { backgroundFile: true },
    });
    if (!template) {
      throw new NotFoundException();
    }
    const layout = this.parseLayout(template.layout);
    const packed = buildTemplatePackage(layout, {
      exportedAt: new Date().toISOString(),
      instance: this.env.INSTANCE,
      sourceEventName: event.name,
      roleCode: template.roleCode,
    });
    const files = [{ name: "layout.json", bytes: Buffer.from(JSON.stringify(packed)) }];
    if (template.backgroundFile) {
      const body = await this.storage.get(template.backgroundFile.storageKey);
      const extension = template.backgroundFile.mimeType === "image/png" ? "png" : "jpg";
      files.push({ name: `background.${extension}`, bytes: Buffer.from(body) });
    }
    const filename = packageFilename(event.name, template.roleCode);
    await this.prisma.auditLog.create({
      data: {
        adminUserId,
        action: "template_export",
        entityType: "certificate_template",
        entityId: template.id,
        ipAddress,
        metadata: { filename },
      },
    });
    return { filename, body: writeStoredZip(files) };
  }

  async importPackage(
    eventId: string,
    templateId: string,
    file: { filename: string; bytes: Buffer },
    preview: boolean,
    adminUserId: string,
    ipAddress: string | null,
  ) {
    const event = await this.events.visible(eventId);
    const template = await this.findTemplate(eventId, templateId);
    const opened = await readTemplateArchive(file.filename, file.bytes);
    if (!opened.ok) {
      throw validationFailed(opened.issues);
    }
    const parsed = parseTemplatePackage(opened.archive.document, { allowLegal: this.env.INSTANCE === "ac3" });
    if (!parsed.ok) {
      throw validationFailed(parsed.issues);
    }
    const image = opened.archive.background ? inspectImage(opened.archive.background.bytes) : null;
    if (image && !image.ok) {
      throw validationFailed([{ field: "background", message: image.message }]);
    }
    if (preview) {
      return {
        preview: true as const,
        layout: parsed.layout,
        background: image?.ok
          ? { mimeType: image.info.mimeType, base64: opened.archive.background!.bytes.toString("base64") }
          : null,
      };
    }
    await this.applyPackage(template, parsed.layout, image?.ok ? { bytes: opened.archive.background!.bytes, mimeType: image.info.mimeType } : null, {
      adminUserId,
      ipAddress,
      metadata: { filename: file.filename },
    });
    const updated = await this.findTemplate(eventId, templateId);
    return this.toTemplate(updated, event.defaultTemplateId);
  }

  async copyFrom(eventId: string, templateId: string, sourceTemplateId: string, adminUserId: string, ipAddress: string | null) {
    const event = await this.events.visible(eventId);
    const template = await this.findTemplate(eventId, templateId);
    const source = await this.prisma.certificateTemplate.findFirst({
      where: { id: sourceTemplateId, event: { deletedAt: null } },
      include: { backgroundFile: true },
    });
    if (!source || source.eventId === eventId) {
      throw validationFailed([{ field: "sourceTemplateId", message: "Elige una plantilla de otro evento." }]);
    }
    const layout = this.parseLayout(source.layout);
    const background = source.backgroundFile
      ? { bytes: await this.storage.get(source.backgroundFile.storageKey), mimeType: source.backgroundFile.mimeType }
      : null;
    await this.applyPackage(template, layout, background, {
      adminUserId,
      ipAddress,
      metadata: { sourceTemplateId: source.id, sourceEventId: source.eventId },
    });
    const updated = await this.findTemplate(eventId, templateId);
    return this.toTemplate(updated, event.defaultTemplateId);
  }

  async sources() {
    const events = await this.prisma.event.findMany({
      where: { deletedAt: null },
      orderBy: [{ year: "desc" }, { name: "asc" }],
      include: { templates: { orderBy: [{ roleCode: "asc" }, { name: "asc" }] } },
    });
    return {
      items: events.flatMap((event) =>
        event.templates.map((template) => ({
          eventId: event.id,
          eventName: event.name,
          year: event.year,
          templateId: template.id,
          name: template.name,
          roleCode: template.roleCode,
          hasBackground: template.backgroundFileId !== null,
        })),
      ),
    };
  }

  private async applyPackage(
    template: { id: string; backgroundFileId: string | null },
    layout: CertificateLayout,
    background: { bytes: Buffer; mimeType: string } | null,
    audit: { adminUserId: string; ipAddress: string | null; metadata: Prisma.InputJsonObject },
  ) {
    const image = background ? inspectImage(background.bytes) : null;
    if (image && !image.ok) {
      throw validationFailed([{ field: "background", message: image.message }]);
    }
    const checksum = background ? createHash("sha256").update(background.bytes).digest("hex") : null;
    const extension = image?.ok && image.info.mimeType === "image/png" ? "png" : "jpg";
    const storageKey = checksum ? `backgrounds/${template.id}/${checksum}.${extension}` : null;
    if (background && storageKey && image?.ok) {
      await this.storage.put(storageKey, background.bytes, image.info.mimeType);
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.certificateTemplate.update({
          where: { id: template.id },
          data: { layout: layout as Prisma.InputJsonValue },
        });
        if (background && storageKey && image?.ok) {
          const file = await tx.storedFile.create({
            data: {
              storageKey,
              mimeType: image.info.mimeType,
              byteSize: BigInt(background.bytes.length),
              checksumSha256: checksum!,
              uploadedById: audit.adminUserId,
            },
          });
          await tx.certificateTemplate.update({ where: { id: template.id }, data: { backgroundFileId: file.id } });
        }
        await tx.auditLog.create({
          data: {
            adminUserId: audit.adminUserId,
            action: "template_import",
            entityType: "certificate_template",
            entityId: template.id,
            ipAddress: audit.ipAddress,
            metadata: audit.metadata,
          },
        });
      });
    } catch (error) {
      if (storageKey) {
        await this.storage.delete(storageKey).catch(() => undefined);
      }
      throw error;
    }
    if (background && template.backgroundFileId) {
      const previous = await this.prisma.storedFile.findUnique({ where: { id: template.backgroundFileId } });
      if (previous && previous.storageKey !== storageKey) {
        await this.deleteStoredFile(previous.id);
      } else if (previous) {
        await this.prisma.storedFile.delete({ where: { id: previous.id } });
      }
    }
  }

  private async findTemplate(eventId: string, templateId: string) {
    const template = await this.prisma.certificateTemplate.findFirst({ where: { id: templateId, eventId } });
    if (!template) {
      throw new NotFoundException();
    }
    return template;
  }

  private parseLayout(layout: unknown): CertificateLayout {
    const parsed = parseCertificateLayout(layout);
    if (!parsed.ok) {
      throw validationFailed([{ field: "layout", message: parsed.message }]);
    }
    if (this.env.INSTANCE !== "ac3" && layoutHasLegal(parsed.layout)) {
      throw validationFailed([{ field: "layout", message: "Las capas legales son de la instancia AC3." }]);
    }
    return parsed.layout;
  }

  private toTemplate(
    template: {
      id: string;
      eventId: string;
      name: string;
      roleCode: string | null;
      layout: Prisma.JsonValue;
      backgroundFileId: string | null;
    },
    defaultTemplateId: string | null,
  ) {
    return {
      id: template.id,
      eventId: template.eventId,
      name: template.name,
      roleCode: template.roleCode,
      isDefault: template.id === defaultTemplateId,
      hasBackground: template.backgroundFileId !== null,
      layout: template.layout,
    };
  }

  private async deleteStoredFile(id: string): Promise<void> {
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!file) {
      return;
    }
    await this.prisma.storedFile.delete({ where: { id } });
    await this.storage.delete(file.storageKey).catch(() => undefined);
  }

  private async ensureRole(allowedRoles: unknown, roleCode: string): Promise<void> {
    if (!readRoleCodes(allowedRoles).includes(roleCode)) {
      throw validationFailed([{ field: "roleCode", message: "Ese rol no está habilitado en el evento." }]);
    }
    const role = await this.prisma.role.findFirst({ where: { code: roleCode, isActive: true } });
    if (!role) {
      throw validationFailed([{ field: "roleCode", message: "Ese rol no está en el catálogo activo." }]);
    }
  }
}

function packageFilename(eventName: string, roleCode: string | null): string {
  const eventSlug = eventName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "evento";
  const roleSlug = roleCode ? roleCode.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "general";
  return `plantilla-${eventSlug}-${roleSlug}.zip`;
}
