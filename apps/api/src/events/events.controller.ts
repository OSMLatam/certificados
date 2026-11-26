import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, Patch, Post, Query, Req, StreamableFile, UseGuards } from "@nestjs/common";
import { parseEventFields } from "@certificados/shared";
import { z } from "zod";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import { validationFailed } from "../common/http";
import { ParticipantsService } from "../participants/participants.service";
import { csvBasename, extractCsvPart } from "../participants/multipart-file";
import { readLimitedStream } from "../templates/image-file";
import { EventsService } from "./events.service";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato YYYY-MM-DD.");
const roleList = z
  .array(z.string().trim().min(1).max(50))
  .min(1, "Elige al menos un rol.")
  .refine((roles) => new Set(roles).size === roles.length, "Los roles vienen repetidos.");

const eventBody = z.object({
  name: z.string().trim().min(1).max(255),
  year: z.number().int().min(2000).max(2100),
  startDate: dateOnly,
  endDate: dateOnly.nullable().optional(),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "El país son dos letras.")
    .transform((value) => value.toUpperCase()),
  allowedRoles: roleList,
  pregeneratedOnly: z.boolean().optional(),
  status: z.enum(["draft", "active"]).optional(),
});

const venueBody = z.object({
  name: z.string().trim().min(1).max(255),
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, "El código de sede solo admite letras, números, guion y guion bajo."),
  eventDate: dateOnly.nullable().optional(),
});

const participantBody = z.object({
  fullName: z.string().trim().min(1).max(255),
  email: z.string().trim().max(255).optional(),
  roles: roleList,
  venueCode: z.string().trim().min(1).max(20).optional(),
  countryCode: z.string().trim().min(2).max(2).optional(),
  docTypeCode: z.string().trim().min(1).max(10).optional(),
  docNumber: z.string().trim().min(1).max(100).optional(),
  activityTitle: z.string().trim().max(2000).nullable().optional(),
});

const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

type RequestWithIp = AdminRequest & { ip?: string };

@Controller("admin/events")
@UseGuards(AdminGuard)
export class EventsController {
  constructor(
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
  ) {}

  @Get()
  list(@Query() query: unknown) {
    const page = parse(pageQuery, query);
    return this.events.list(page.page ?? 1, page.pageSize ?? 20);
  }

  @Post()
  @HttpCode(201)
  create(@Req() request: RequestWithIp, @Body() body: unknown) {
    const record = isRecord(body) ? body : {};
    const fields = parseEventFields({
      name: typeof record.name === "string" ? record.name : "",
      startDate: typeof record.startDate === "string" ? record.startDate : "",
    });
    if (!fields.ok) {
      throw validationFailed(fields.issues);
    }
    const year = typeof record.year === "number" ? record.year : Number(fields.startDate.slice(0, 4));
    return this.events.create(request.adminUser!.id, parse(eventBody, { ...record, name: fields.name, startDate: fields.startDate, year }));
  }

  @Get(":id/venues")
  listVenues(@Param("id") id: string) {
    return this.events.listVenues(id);
  }

  @Post(":id/venues")
  @HttpCode(201)
  createVenue(@Param("id") id: string, @Body() body: unknown) {
    return this.events.createVenue(id, parse(venueBody, body));
  }

  @Get(":id/participants")
  listParticipants(@Param("id") id: string, @Query() query: unknown) {
    const page = parse(pageQuery, query);
    return this.participants.list(id, page.page ?? 1, page.pageSize ?? 20);
  }

  @Post(":id/participants")
  @HttpCode(201)
  createParticipant(@Param("id") id: string, @Body() body: unknown) {
    return this.participants.create(id, parse(participantBody, body));
  }

  @Get(":id/participants/import/template")
  @Header("Content-Disposition", 'attachment; filename="participantes.csv"')
  async participantTemplate(@Param("id") id: string) {
    const csv = await this.participants.templateCsv(id);
    return new StreamableFile(Buffer.from(csv), { type: "text/csv; charset=utf-8" });
  }

  @Post(":id/participants/import")
  @HttpCode(201)
  async importParticipants(@Req() request: ImportRequest, @Param("id") id: string) {
    const uploaded = await readLimitedStream(request, MAX_PARTICIPANT_CSV_BYTES);
    if (!uploaded.ok) {
      throw validationFailed([{ field: "file", message: "El CSV supera 10 MB." }]);
    }
    const contentType = headerValue(request.headers["content-type"]);
    let filename = filenameFromDisposition(headerValue(request.headers["content-disposition"]));
    let bytes = uploaded.buffer;
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const part = extractCsvPart(bytes, contentType);
      if (!part.ok) {
        throw validationFailed([{ field: "file", message: part.message }]);
      }
      filename = part.filename;
      bytes = part.bytes;
    }
    const basename = csvBasename(filename);
    if (!basename) {
      throw validationFailed([{ field: "file", message: "El nombre del archivo no es válido." }]);
    }
    return this.participants.importCsv(id, bytes, basename, request.adminUser!.id, request.ip ?? null);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.events.get(id);
  }

  @Patch(":id")
  update(@Req() request: RequestWithIp, @Param("id") id: string, @Body() body: unknown) {
    return this.events.update(request.adminUser!.id, id, parse(eventBody.partial(), body), request.ip ?? null);
  }

  @Delete(":id")
  remove(@Req() request: RequestWithIp, @Param("id") id: string) {
    return this.events.softDelete(request.adminUser!.id, id, request.ip ?? null);
  }
}

const MAX_PARTICIPANT_CSV_BYTES = 10 * 1024 * 1024;

type ImportRequest = AdminRequest &
  AsyncIterable<Uint8Array> & {
    ip?: string;
    headers: AdminRequest["headers"] & {
      "content-type"?: string | string[];
      "content-disposition"?: string | string[];
    };
  };

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function filenameFromDisposition(header: string): string {
  return /filename="([^"]*)"/i.exec(header)?.[1] ?? /filename=([^;\s]+)/i.exec(header)?.[1] ?? "participantes.csv";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
