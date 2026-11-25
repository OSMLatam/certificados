import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { Event, Prisma } from "@prisma/client";
import { formatDateOnly, parseDateOnly, readRoleCodes, validationFailed } from "../common/http";
import { PrismaService } from "../prisma/prisma.service";
import { activationBlocked, type EventStatusName } from "./event-rules";
import { EventAccess } from "./event-access";

export type EventBody = {
  name: string;
  year: number;
  startDate: string;
  endDate?: string | null;
  countryCode: string;
  allowedRoles: string[];
  pregeneratedOnly?: boolean;
  status?: EventStatusName;
};

export type VenueBody = {
  name: string;
  code: string;
  eventDate?: string | null;
};

@Injectable()
export class EventsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccess) private readonly events: EventAccess,
  ) {}

  async list(page: number, pageSize: number) {
    const where = { deletedAt: null };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        orderBy: [{ startDate: "desc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { venues: true, participants: true } } },
      }),
    ]);
    return {
      items: rows.map((row) => this.toEvent(row)),
      meta: { page, pageSize, total },
    };
  }

  async get(id: string) {
    const event = await this.events.visible(id);
    const counts = await this.prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      include: { _count: { select: { venues: true, participants: true } } },
    });
    return this.toEvent(counts);
  }

  async create(adminUserId: string, body: EventBody) {
    await this.ensureRoles(body.allowedRoles);
    const status = body.status ?? "draft";
    if (activationBlocked({ status, pregeneratedOnly: body.pregeneratedOnly ?? false, defaultTemplateId: null })) {
      throw validationFailed([
        {
          field: "status",
          message: "Un evento generado no puede nacer activo: primero guarda la plantilla predeterminada.",
        },
      ]);
    }
    this.ensureDateOrder(body.startDate, body.endDate);
    const event = await this.prisma.event.create({
      data: this.eventData(adminUserId, body, status),
      include: { _count: { select: { venues: true, participants: true } } },
    });
    return this.toEvent(event);
  }

  async update(adminUserId: string, id: string, body: Partial<EventBody>, ipAddress: string | null) {
    const current = await this.events.visible(id);
    if (body.allowedRoles) {
      await this.ensureRoles(body.allowedRoles);
    }
    const nextStatus = body.status ?? current.status;
    const nextPregenerated = body.pregeneratedOnly ?? current.pregeneratedOnly;
    const startDate = body.startDate ?? formatDateOnly(current.startDate);
    const endDate = body.endDate === undefined ? (current.endDate ? formatDateOnly(current.endDate) : null) : body.endDate;
    this.ensureDateOrder(startDate, endDate);
    if (
      activationBlocked({
        status: nextStatus,
        pregeneratedOnly: nextPregenerated,
        defaultTemplateId: current.defaultTemplateId,
      })
    ) {
      throw validationFailed([
        {
          field: "status",
          message: "No se puede activar un evento generado sin plantilla predeterminada.",
        },
      ]);
    }
    const data: Prisma.EventUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.year !== undefined) data.year = body.year;
    if (body.startDate !== undefined) data.startDate = parseDateOnly(body.startDate);
    if (body.endDate !== undefined) data.endDate = body.endDate ? parseDateOnly(body.endDate) : null;
    if (body.countryCode !== undefined) data.countryCode = body.countryCode;
    if (body.allowedRoles !== undefined) data.allowedRoles = body.allowedRoles;
    if (body.pregeneratedOnly !== undefined) data.pregeneratedOnly = body.pregeneratedOnly;
    if (body.status !== undefined) data.status = body.status;

    const event = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.event.update({
        where: { id: current.id },
        data,
        include: { _count: { select: { venues: true, participants: true } } },
      });
      if (body.status !== undefined && body.status !== current.status) {
        await tx.auditLog.create({
          data: {
            adminUserId,
            action: "event_status_change",
            entityType: "event",
            entityId: current.id,
            ipAddress,
            metadata: { old_status: current.status, new_status: body.status },
          },
        });
      }
      return updated;
    });
    return this.toEvent(event);
  }

  async softDelete(adminUserId: string, id: string, ipAddress: string | null) {
    const current = await this.events.visible(id);
    const actor = await this.prisma.adminUser.findUnique({ where: { id: adminUserId } });
    const ownEvent = actor?.role === "editor" && current.createdById === actor.id;
    if (!actor?.isActive || (actor.role !== "admin" && !ownEvent)) {
      throw new ForbiddenException();
    }
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id: current.id }, data: { deletedAt } });
      await tx.auditLog.create({
        data: {
          adminUserId,
          action: "event_soft_delete",
          entityType: "event",
          entityId: current.id,
          ipAddress,
          metadata: {},
        },
      });
    });
    return { id: current.id, deletedAt: deletedAt.toISOString() };
  }

  async listVenues(eventId: string) {
    await this.events.visible(eventId);
    const venues = await this.prisma.venue.findMany({
      where: { eventId },
      orderBy: { name: "asc" },
    });
    return { items: venues.map(toVenue) };
  }

  async createVenue(eventId: string, body: VenueBody) {
    await this.events.visible(eventId);
    const existing = await this.prisma.venue.findUnique({
      where: { eventId_code: { eventId, code: body.code } },
    });
    if (existing) {
      throw validationFailed([{ field: "code", message: "Ya hay una sede con ese código en el evento." }]);
    }
    const venue = await this.prisma.venue.create({
      data: {
        eventId,
        name: body.name,
        code: body.code,
        eventDate: body.eventDate ? parseDateOnly(body.eventDate) : null,
      },
    });
    return toVenue(venue);
  }

  private async ensureRoles(codes: string[]): Promise<void> {
    const found = await this.prisma.role.findMany({
      where: { code: { in: codes }, isActive: true },
      select: { code: true },
    });
    const known = new Set(found.map((role) => role.code));
    const missing = codes.filter((code) => !known.has(code));
    if (missing.length > 0) {
      throw validationFailed([
        { field: "allowedRoles", message: `Roles desconocidos: ${missing.join(", ")}.` },
      ]);
    }
  }

  private ensureDateOrder(startDate: string, endDate: string | null | undefined): void {
    if (endDate && endDate < startDate) {
      throw validationFailed([
        { field: "endDate", message: "La fecha de fin no puede ser anterior a la de inicio." },
      ]);
    }
  }

  private eventData(adminUserId: string, body: EventBody, status: EventStatusName): Prisma.EventCreateInput {
    return {
      name: body.name,
      year: body.year,
      startDate: parseDateOnly(body.startDate),
      endDate: body.endDate ? parseDateOnly(body.endDate) : null,
      countryCode: body.countryCode,
      allowedRoles: body.allowedRoles,
      status,
      pregeneratedOnly: body.pregeneratedOnly ?? false,
      createdBy: { connect: { id: adminUserId } },
    };
  }

  private toEvent(
    event: Event & { _count?: { venues: number; participants: number } },
  ) {
    return {
      id: event.id,
      name: event.name,
      year: event.year,
      startDate: formatDateOnly(event.startDate),
      endDate: event.endDate ? formatDateOnly(event.endDate) : null,
      countryCode: event.countryCode.trim(),
      allowedRoles: readRoleCodes(event.allowedRoles),
      status: event.status,
      pregeneratedOnly: event.pregeneratedOnly,
      defaultTemplateId: event.defaultTemplateId,
      venueCount: event._count?.venues ?? 0,
      participantCount: event._count?.participants ?? 0,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }
}

function toVenue(venue: { id: string; eventId: string; name: string; code: string; eventDate: Date | null }) {
  return {
    id: venue.id,
    eventId: venue.eventId,
    name: venue.name,
    code: venue.code,
    eventDate: venue.eventDate ? formatDateOnly(venue.eventDate) : null,
  };
}
