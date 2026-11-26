import "reflect-metadata";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config as loadDotenv } from "dotenv";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { isPermalinkSlug } from "@certificados/shared";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { ParticipantsService } from "../participants/participants.service";
import { EventAccess } from "./event-access";
import { EventsService } from "./events.service";

loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });
const env = loadEnv();

describe("events, venues and participants", () => {
  const prisma = new PrismaService();
  const access = new EventAccess(prisma);
  const events = new EventsService(prisma, access);
  const participants = new ParticipantsService(env, prisma, access);
  const createdEventIds: string[] = [];

  it("keeps a generated event in draft until it has a template, then reserves one certificate per role", async () => {
    try {
    const admin = await prisma.adminUser.create({
      data: { osmId: BigInt(Date.now()), osmUsername: "events-spec", role: "admin" },
    });

    await assert.rejects(
      () =>
        events.create(admin.id, {
          name: " ",
          year: 2026,
          startDate: "",
          countryCode: "CO",
          allowedRoles: ["asistente"],
        }),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        const body = error.getResponse() as { details?: { field: string; message: string }[] };
        assert.deepEqual(body.details, [
          { field: "name", message: "Escribe el nombre del evento" },
          { field: "startDate", message: "Escribe la fecha de inicio" },
        ]);
        return true;
      },
    );

    const draft = await events.create(admin.id, {
      name: "SOTM prueba",
      year: 2026,
      startDate: "2026-11-22",
      endDate: "2026-11-23",
      countryCode: "CO",
      allowedRoles: ["asistente", "voluntario", "organizador"],
    });
    createdEventIds.push(draft.id);
    assert.equal(draft.status, "draft");
    await expectField(() => events.update(admin.id, draft.id, { status: "active" }, "127.0.0.1"), "status");

    const venue = await events.createVenue(draft.id, { name: "Bogotá", code: "BOG", eventDate: "2026-11-22" });
    await expectField(
      () =>
        participants.create(draft.id, {
          fullName: "Ada Lovelace",
          email: "Ada@Example.ORG",
          roles: ["asistente", "voluntario"],
        }),
      "roles",
    );

    const template = await prisma.certificateTemplate.create({
      data: { eventId: draft.id, roleCode: null, name: "General", layout: { layers: [] } },
    });
    await prisma.event.update({ where: { id: draft.id }, data: { defaultTemplateId: template.id } });
    const active = await events.update(admin.id, draft.id, { status: "active" }, "127.0.0.1");
    assert.equal(active.status, "active");

    const created = await participants.create(draft.id, {
      fullName: "Ada Lovelace",
      email: "Ada@Example.ORG",
      roles: ["asistente", "voluntario"],
      countryCode: "CO",
      docTypeCode: "CC",
      docNumber: "12.345.678-9",
      activityTitle: "Mapatón",
    });
    assert.equal(created.email, "ada@example.org");
    assert.equal(created.docNumber, "123456789");
    assert.equal(created.venueId, venue.id);
    assert.equal(created.certificates.length, 2);
    assert.ok(
      created.certificates.every(
        (certificate) =>
          certificate.status === "pending" &&
          certificate.mode === "generated" &&
          certificate.templateId === template.id &&
          certificate.venueId === venue.id &&
          isPermalinkSlug(certificate.slug),
      ),
    );

    await expectField(
      () =>
        participants.create(draft.id, {
          fullName: "Ada Lovelace",
          email: "ada@example.org",
          roles: ["organizador"],
          countryCode: "CO",
          docTypeCode: "CC",
          docNumber: "99.999.999",
        }),
      "docNumber",
    );
    const stillTwo = await participants.list(draft.id, 1, 20);
    assert.equal(stillTwo.items[0]?.certificates.length, 2);

    const withThird = await participants.create(draft.id, {
      fullName: "Ada Lovelace",
      email: "ada@example.org",
      roles: ["organizador"],
      countryCode: "CO",
      docTypeCode: "CC",
      docNumber: "123456789",
    });
    assert.equal(withThird.certificates.length, 3);

    await expectField(
      () =>
        participants.create(draft.id, {
          fullName: "Ada Lovelace",
          email: "ada@example.org",
          roles: ["asistente"],
          activityTitle: "Mapatón",
        }),
      "roles",
    );
    const sameRole = await participants.create(draft.id, {
      fullName: "Ada Lovelace",
      email: "ada@example.org",
      roles: ["asistente"],
      activityTitle: "Otro taller",
    });
    assert.equal(sameRole.certificates.length, 4);

    const documentOnly = await participants.create(draft.id, {
      fullName: "Sin Correo",
      email: "",
      roles: ["asistente"],
      countryCode: "CO",
      docTypeCode: "CC",
      docNumber: "10203040",
    });
    assert.equal(documentOnly.email, null);
    assert.equal(documentOnly.docNumber, "10203040");
    assert.equal(documentOnly.certificates.length, 1);
    await expectField(
      () =>
        participants.create(draft.id, {
          fullName: "Nadie",
          email: "",
          roles: ["asistente"],
        }),
      "email",
    );

    const pregenerated = await events.create(admin.id, {
      name: "SOTM precargado",
      year: 2026,
      startDate: "2026-11-22",
      countryCode: "CO",
      allowedRoles: ["asistente"],
      pregeneratedOnly: true,
      status: "active",
    });
    createdEventIds.push(pregenerated.id);
    const uploaded = await participants.create(pregenerated.id, {
      fullName: "Bea",
      email: "bea@example.org",
      roles: ["asistente"],
    });
    assert.equal(uploaded.certificates[0]?.mode, "pregenerated");
    assert.equal(uploaded.certificates[0]?.templateId, null);
    assert.equal(uploaded.venueId, null);

    const editor = await prisma.adminUser.create({
      data: { osmId: BigInt(Date.now() + 1), osmUsername: "events-editor", role: "editor" },
    });
    await assert.rejects(() => events.softDelete(editor.id, draft.id, "127.0.0.1"), ForbiddenException);
    const own = await events.create(editor.id, {
      name: "Evento del editor",
      year: 2026,
      startDate: "2026-11-22",
      countryCode: "CO",
      allowedRoles: ["asistente"],
    });
    createdEventIds.push(own.id);
    const ownRemoved = await events.softDelete(editor.id, own.id, "127.0.0.1");
    assert.ok(ownRemoved.deletedAt);

    const removed = await events.softDelete(admin.id, draft.id, "127.0.0.1");
    assert.ok(removed.deletedAt);
    const listed = await events.list(1, 100);
    assert.equal(listed.items.some((item) => item.id === draft.id), false);
    await assert.rejects(() => events.get(draft.id), NotFoundException);

    const audits = await prisma.auditLog.findMany({
      where: { entityId: draft.id },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(
      audits.map((entry) => entry.action),
      ["event_status_change", "event_soft_delete"],
    );
    } finally {
      for (const eventId of createdEventIds) {
        await prisma.certificate.deleteMany({ where: { eventId } });
        await prisma.participant.deleteMany({ where: { eventId } });
        await prisma.venue.deleteMany({ where: { eventId } });
        await prisma.event.update({ where: { id: eventId }, data: { defaultTemplateId: null } });
        await prisma.certificateTemplate.deleteMany({ where: { eventId } });
        await prisma.auditLog.deleteMany({ where: { entityId: eventId } });
        await prisma.event.delete({ where: { id: eventId } });
      }
      await prisma.adminUser.deleteMany({ where: { osmUsername: { in: ["events-spec", "events-editor"] } } });
      await prisma.$disconnect();
    }
  });
});

async function expectField(run: () => Promise<unknown>, field: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    const body = error.getResponse() as { details?: { field: string }[] };
    assert.equal(body.details?.[0]?.field, field);
    return true;
  });
}
