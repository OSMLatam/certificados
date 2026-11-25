import "reflect-metadata";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config as loadDotenv } from "dotenv";
import { BadRequestException } from "@nestjs/common";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { EventAccess } from "../events/event-access";
import { EventsService } from "../events/events.service";
import { ParticipantsService } from "../participants/participants.service";
import { SearchService } from "./search.service";

loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });
const env = loadEnv();

describe("public search", () => {
  const prisma = new PrismaService();
  const access = new EventAccess(prisma);
  const events = new EventsService(prisma, access);
  const participants = new ParticipantsService(env, prisma, access);
  const search = new SearchService(env, prisma);

  it("returns every active certificate for an email or a normalized document", async () => {
    const eventIds: string[] = [];
    let adminId = "";
    try {
      const admin = await prisma.adminUser.create({
        data: { osmId: BigInt(Date.now()), osmUsername: "search-spec", role: "admin" },
      });
      adminId = admin.id;
      const active = await readyEvent(events, prisma, admin.id, "Mapatón activo", "active");
      const older = await readyEvent(events, prisma, admin.id, "FLISoL anterior", "active");
      const draft = await readyEvent(events, prisma, admin.id, "Borrador", "draft");
      eventIds.push(active.id, older.id, draft.id);
      await prisma.event.update({ where: { id: older.id }, data: { startDate: new Date("2024-08-01T00:00:00.000Z"), year: 2024 } });

      await participants.create(active.id, {
        fullName: "Ada Lovelace",
        email: "Ada@Example.ORG",
        roles: ["asistente", "voluntario"],
        countryCode: "CO",
        docTypeCode: "CC",
        docNumber: "1234567890",
      });
      await participants.create(older.id, {
        fullName: "Ada Lovelace",
        email: "ada@example.org",
        roles: ["ponente"],
        countryCode: "CO",
        docTypeCode: "CC",
        docNumber: "12.345.678-90",
      });
      await participants.create(draft.id, {
        fullName: "Ada Lovelace",
        email: "ada@example.org",
        roles: ["asistente"],
        countryCode: "CO",
        docTypeCode: "CC",
        docNumber: "1234567890",
      });

      const byEmail = await search.search({ kind: "email", email: "ADA@example.org" });
      assert.equal(byEmail.message, null);
      assert.deepEqual(
        byEmail.items.map((item) => `${item.eventName}:${item.roleCode}`).sort(),
        ["FLISoL anterior:ponente", "Mapatón activo:asistente", "Mapatón activo:voluntario"],
      );
      assert.ok(byEmail.items.every((item) => item.status === "pending" && item.fullName === "Ada Lovelace"));
      assert.equal(byEmail.items[0]?.eventName, "Mapatón activo");

      const byDocument = await search.search({
        kind: "document",
        countryCode: "co",
        docTypeCode: "cc",
        docNumber: "12.345.678-90",
      });
      assert.equal(byDocument.items.length, 3);
      assert.equal(await prisma.certificate.count({ where: { eventId: active.id, status: "pending" } }), 2);

      const missing = await search.search({ kind: "email", email: "nadie@example.org" });
      assert.deepEqual(missing, { message: "No encontramos credenciales con esos datos.", items: [] });

      await assert.rejects(
        () => search.search({ kind: "document", countryCode: "CO", docTypeCode: "XX", docNumber: "1234567890" }),
        (error: unknown) => error instanceof BadRequestException,
      );
    } finally {
      for (const eventId of eventIds) {
        await prisma.certificate.deleteMany({ where: { eventId } });
        await prisma.participant.deleteMany({ where: { eventId } });
        await prisma.venue.deleteMany({ where: { eventId } });
        await prisma.event.update({ where: { id: eventId }, data: { defaultTemplateId: null } });
        await prisma.certificateTemplate.deleteMany({ where: { eventId } });
        await prisma.auditLog.deleteMany({ where: { entityId: eventId } });
        await prisma.event.delete({ where: { id: eventId } });
      }
      if (adminId) {
        await prisma.adminUser.delete({ where: { id: adminId } });
      }
      await prisma.$disconnect();
    }
  });
});

async function readyEvent(
  events: EventsService,
  prisma: PrismaService,
  adminId: string,
  name: string,
  status: "draft" | "active",
) {
  const event = await events.create(adminId, {
    name,
    year: 2026,
    startDate: "2026-11-22",
    countryCode: "CO",
    allowedRoles: ["asistente", "voluntario", "ponente"],
  });
  const template = await prisma.certificateTemplate.create({
    data: { eventId: event.id, roleCode: null, name: "General", layout: { layers: [] } },
  });
  await prisma.event.update({ where: { id: event.id }, data: { defaultTemplateId: template.id } });
  if (status === "active") {
    return events.update(adminId, event.id, { status: "active" }, null);
  }
  return events.get(event.id);
}
