import { Header, HttpCode, Inject, Param, Post, Get, Req, StreamableFile, UseGuards, Controller } from "@nestjs/common";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import { validationFailed } from "../common/http";
import { csvBasename } from "../participants/multipart-file";
import { readLimitedStream } from "../templates/image-file";
import { extractMultipartFiles } from "./multipart-files";
import { PregeneratedService } from "./pregenerated.service";

const MAX_BATCH_BYTES = 100 * 1024 * 1024;
const MAX_ONE_FILE_BYTES = 10 * 1024 * 1024;

type UploadRequest = AdminRequest &
  AsyncIterable<Uint8Array> & {
    ip?: string;
    headers: AdminRequest["headers"] & { "content-type"?: string | string[] };
  };

@Controller("admin/events")
@UseGuards(AdminGuard)
export class PregeneratedImportController {
  constructor(@Inject(PregeneratedService) private readonly pregenerated: PregeneratedService) {}

  @Get(":id/pregenerated/import/template")
  @Header("Content-Disposition", 'attachment; filename="pregenerados.csv"')
  async template(@Param("id") id: string) {
    const csv = await this.pregenerated.templateCsv(id);
    return new StreamableFile(Buffer.from(csv), { type: "text/csv; charset=utf-8" });
  }

  @Post(":id/pregenerated/import")
  @HttpCode(201)
  async importBatch(@Req() request: UploadRequest, @Param("id") id: string) {
    const uploaded = await readLimitedStream(request, MAX_BATCH_BYTES);
    if (!uploaded.ok) {
      throw validationFailed([{ field: "file", message: "El lote supera 100 MB." }]);
    }
    const contentType = headerValue(request.headers["content-type"]);
    const parts = extractMultipartFiles(uploaded.buffer, contentType);
    if (!parts.ok) {
      throw validationFailed([{ field: "file", message: parts.message }]);
    }
    const csv = parts.files.get("csv");
    const zip = parts.files.get("zip");
    if (!csv || !zip) {
      throw validationFailed([{ field: "file", message: "El formulario necesita los campos csv y zip." }]);
    }
    const filename = csvBasename(csv.filename);
    if (!filename) {
      throw validationFailed([{ field: "file", message: "El nombre del archivo no es válido." }]);
    }
    return this.pregenerated.importZip(id, csv.bytes, zip.bytes, filename, request.adminUser!.id, request.ip ?? null);
  }
}

@Controller("admin/certificates")
@UseGuards(AdminGuard)
export class PregeneratedFileController {
  constructor(@Inject(PregeneratedService) private readonly pregenerated: PregeneratedService) {}

  @Post(":id/pregenerated")
  @HttpCode(201)
  async upload(@Req() request: UploadRequest, @Param("id") id: string) {
    const uploaded = await readLimitedStream(request, MAX_ONE_FILE_BYTES);
    if (!uploaded.ok) {
      throw validationFailed([{ field: "file", message: "El archivo supera 10 MB." }]);
    }
    const contentType = headerValue(request.headers["content-type"]);
    let bytes = uploaded.buffer;
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const parts = extractMultipartFiles(bytes, contentType);
      if (!parts.ok) {
        throw validationFailed([{ field: "file", message: parts.message }]);
      }
      const file = parts.files.get("file") ?? [...parts.files.values()][0];
      if (!file) {
        throw validationFailed([{ field: "file", message: "El formulario no incluye el archivo." }]);
      }
      bytes = file.bytes;
    }
    return this.pregenerated.attachFile(id, bytes, request.adminUser!.id);
  }
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
