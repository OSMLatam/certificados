import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, StreamableFile, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import { validationFailed } from "../common/http";
import { MAX_BACKGROUND_BYTES, readLimitedStream } from "./image-file";
import { extractMultipartFiles } from "../pregenerated/multipart-files";
import { MAX_TEMPLATE_ZIP_BYTES } from "./template-archive";
import { TemplatesService } from "./templates.service";

const templateBody = z.object({
  name: z.string().trim().min(1).max(255),
  roleCode: z.string().trim().min(1).max(50).nullable().optional(),
  layout: z.unknown().optional(),
});

@Controller("admin")
@UseGuards(AdminGuard)
export class TemplateCatalogController {
  constructor(@Inject(TemplatesService) private readonly templates: TemplatesService) {}

  @Get("template-sources")
  sources() {
    return this.templates.sources();
  }
}

@Controller("admin/events")
@UseGuards(AdminGuard)
export class TemplatesController {
  constructor(@Inject(TemplatesService) private readonly templates: TemplatesService) {}

  @Get(":id/templates")
  list(@Param("id") id: string) {
    return this.templates.list(id);
  }

  @Post(":id/templates")
  @HttpCode(201)
  create(@Param("id") id: string, @Body() body: unknown) {
    return this.templates.create(id, parse(templateBody, body));
  }

  @Patch(":id/templates/:templateId")
  update(@Param("id") id: string, @Param("templateId") templateId: string, @Body() body: unknown) {
    const parsed = parse(layoutBody, body);
    return this.templates.updateLayout(id, templateId, parsed.layout);
  }

  @Post(":id/templates/:templateId/background")
  async uploadBackground(
    @Req() request: AdminRequest & AsyncIterable<Uint8Array>,
    @Param("id") id: string,
    @Param("templateId") templateId: string,
  ) {
    const body = await readLimitedStream(request, MAX_BACKGROUND_BYTES);
    if (!body.ok) {
      throw validationFailed([{ field: "file", message: "La imagen supera 10 MB." }]);
    }
    return this.templates.setBackground(id, templateId, body.buffer, request.adminUser!.id);
  }

  @Get(":id/templates/:templateId/export")
  async exportPackage(
    @Req() request: AdminRequest & { ip?: string },
    @Param("id") id: string,
    @Param("templateId") templateId: string,
  ) {
    const file = await this.templates.exportPackage(id, templateId, request.adminUser!.id, request.ip ?? null);
    return new StreamableFile(file.body, {
      type: "application/zip",
      disposition: `attachment; filename="${file.filename}"`,
      length: file.body.length,
    });
  }

  @Post(":id/templates/:templateId/import")
  async importPackage(
    @Req() request: UploadRequest,
    @Param("id") id: string,
    @Param("templateId") templateId: string,
    @Query("preview") preview?: string,
  ) {
    const uploaded = await readLimitedStream(request, MAX_TEMPLATE_ZIP_BYTES);
    if (!uploaded.ok) {
      throw validationFailed([{ field: "file", message: "El archivo supera 15 MB." }]);
    }
    const contentType = headerValue(request.headers["content-type"]);
    let filename = "plantilla.json";
    let bytes = uploaded.buffer;
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const parts = extractMultipartFiles(bytes, contentType);
      if (!parts.ok) {
        throw validationFailed([{ field: "file", message: parts.message }]);
      }
      const file = parts.files.get("file");
      if (!file) {
        throw validationFailed([{ field: "file", message: "El formulario no incluye el archivo." }]);
      }
      filename = file.filename;
      bytes = file.bytes;
    }
    return this.templates.importPackage(id, templateId, { filename, bytes }, preview === "1", request.adminUser!.id, request.ip ?? null);
  }

  @Post(":id/templates/:templateId/copy-from")
  copyFrom(
    @Req() request: AdminRequest & { ip?: string },
    @Param("id") id: string,
    @Param("templateId") templateId: string,
    @Body() body: unknown,
  ) {
    const parsed = parse(copyBody, body);
    return this.templates.copyFrom(id, templateId, parsed.sourceTemplateId, request.adminUser!.id, request.ip ?? null);
  }

  @Get(":id/templates/:templateId/background")
  async background(@Param("id") id: string, @Param("templateId") templateId: string) {
    const file = await this.templates.readBackground(id, templateId);
    return new StreamableFile(file.body, { type: file.mimeType, length: file.body.length });
  }
}

const layoutBody = z.object({ layout: z.unknown() });
const copyBody = z.object({ sourceTemplateId: z.string().uuid() });

type UploadRequest = AdminRequest &
  AsyncIterable<Uint8Array> & {
    ip?: string;
    headers: AdminRequest["headers"] & { "content-type"?: string | string[] };
  };

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationFailed(
      result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
    );
  }
  return result.data;
}
