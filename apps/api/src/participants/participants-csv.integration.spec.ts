import "reflect-metadata";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config as loadDotenv } from "dotenv";
import { BadRequestException } from "@nestjs/common";
import { PARTICIPANT_CSV_HEADERS, participantCsvTemplate } from "@certificados/shared";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { EventAccess } from "../events/event-access";
import { EventsService } from "../events/events.service";
import { ParticipantsService } from "./participants.service";

loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });
const env = loadEnv();
const header = PARTICIPANT_CSV_HEADERS.join(";");

describe("participant csv import", () => {
  const prisma = new PrismaService();
  const access = new EventAccess(prisma);
  const events = new EventsService(prisma, access);
  const participants = new ParticipantsService(env, prisma, access);

  it("writes a valid file once, then accepts only new rows", async () => {
    const createdEventIds: string[] = [];
    let adminId = "";
    try {
      const admin = await prisma.adminUser.create({
        data: { osmId: BigInt(Date.now()), osmUsername: "csv-spec", role: "admin" },
      });
      adminId = admin.id;
      const event = await events.create(admin.id, {
        name: "CSV prueba",
        year: 2026,
        startDate: "2026-11-22",
        countryCode: "CO",
        allowedRoles: ["asistente", "voluntario", "ponente", "organizador"],
      });
      createdEventIds.push(event.id);
      const venue = await events.createVenue(event.id, { name: "Bogotá", code: "BOG" });
      const template = await prisma.certificateTemplate.create({
        data: { eventId: event.id, roleCode: null, name: "General", layout: { layers: [] } },
      });
      await prisma.event.update({ where: { id: event.id }, data: { defaultTemplateId: template.id } });

      await expectIssue(
        () => participants.importCsv(event.id, Buffer.from([0x50, 0x4b, 0x03, 0x04]), "hoja.xlsx", admin.id, "127.0.0.1"),
        "file",
      );
      assert.equal(await prisma.participant.count({ where: { eventId: event.id } }), 0);

      const imported = await participants.importCsv(
        event.id,
        Buffer.from(participantCsvTemplate()),
        "participantes.csv",
        admin.id,
        "127.0.0.1",
      );
      assert.deepEqual(imported, { rowCount: 4, participantCount: 3, certificateCount: 4 });
      const ana = await prisma.participant.findFirstOrThrow({
        where: { eventId: event.id, email: "ana@example.org" },
        include: { certificates: true },
      });
      assert.equal(ana.docNumber, "1234567890");
      assert.equal(ana.certificates.length, 2);
      assert.ok(ana.certificates.every((certificate) => certificate.status === "pending" && certificate.templateId === template.id && certificate.venueId === venue.id));
      const carlos = await prisma.participant.findFirstOrThrow({
        where: { eventId: event.id, email: "carlos@example.org" },
      });
      assert.equal(carlos.activityTitle, "Mapping con OpenStreetMap");

      await expectIssue(
        () => participants.importCsv(event.id, Buffer.from(participantCsvTemplate()), "participantes.csv", admin.id, null),
        "role",
      );
      assert.equal(await prisma.certificate.count({ where: { eventId: event.id } }), 4);
      assert.equal(await prisma.auditLog.count({ where: { entityId: event.id, action: "participant_csv_import" } }), 1);

      const conflict = `${header}\nAna García;ana@example.org;CO;CC;1111111111;organizador;;\n`;
      await expectIssue(() => participants.importCsv(event.id, Buffer.from(conflict), "conflicto.csv", admin.id, null), "doc_number");
      assert.equal(await prisma.certificate.count({ where: { participantId: ana.id } }), 2);

      const more = `${header}\nAna García;ana@example.org;CO;CC;1234567890;organizador;;\nNueva Persona;nueva@example.org;;;;asistente;;\n`;
      const added = await participants.importCsv(event.id, Buffer.from(more), "nuevos.csv", admin.id, "127.0.0.1");
      assert.equal(added.certificateCount, 2);
      assert.equal(await prisma.participant.count({ where: { eventId: event.id } }), 4);
      const audits = await prisma.auditLog.findMany({
        where: { entityId: event.id, action: "participant_csv_import" },
        orderBy: { createdAt: "asc" },
      });
      assert.deepEqual(
        audits.map((entry) => entry.metadata),
        [
          { row_count: 4, filename: "participantes.csv" },
          { row_count: 2, filename: "nuevos.csv" },
        ],
      );

      const rejected = await events.create(admin.id, {
        name: "CSV rol",
        year: 2026,
        startDate: "2026-11-22",
        countryCode: "CO",
        allowedRoles: ["asistente"],
      });
      createdEventIds.push(rejected.id);
      const rejectedTemplate = await prisma.certificateTemplate.create({
        data: { eventId: rejected.id, roleCode: null, name: "General", layout: { layers: [] } },
      });
      await prisma.event.update({ where: { id: rejected.id }, data: { defaultTemplateId: rejectedTemplate.id } });
      const badRole = `${header}\nOtra;otra@example.org;;;;extraterrestre;;\n`;
      await expectIssue(
        () => participants.importCsv(rejected.id, Buffer.from(badRole), "mal.csv", admin.id, null),
        "role",
        "extraterrestre",
      );
      assert.equal(await prisma.participant.count({ where: { eventId: rejected.id } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { entityId: rejected.id } }), 0);

      const bare = await events.create(admin.id, {
        name: "CSV sin plantilla",
        year: 2026,
        startDate: "2026-11-22",
        countryCode: "CO",
        allowedRoles: ["asistente"],
      });
      createdEventIds.push(bare.id);
      const noTemplate = `${header}\nAda Lovelace;ada@example.org;;;;asistente;;\n`;
      await expectIssue(() => participants.importCsv(bare.id, Buffer.from(noTemplate), "vacio.csv", admin.id, null), "role");
      assert.equal(await prisma.participant.count({ where: { eventId: bare.id } }), 0);

      const documentsOnly = `${header}\nLucía Pérez;;CO;CC;1020304050;asistente;;\nPedro Gómez;;CO;CC;1020304051;asistente;;\n`;
      const withoutEmail = await participants.importCsv(event.id, Buffer.from(documentsOnly), "documentos.csv", admin.id, "127.0.0.1");
      assert.equal(withoutEmail.participantCount, 2);
      const lucia = await prisma.participant.findFirstOrThrow({ where: { eventId: event.id, fullName: "Lucía Pérez" } });
      const pedro = await prisma.participant.findFirstOrThrow({ where: { eventId: event.id, fullName: "Pedro Gómez" } });
      assert.equal(lucia.email, null);
      assert.equal(lucia.docNumber, "1020304050");
      assert.equal(pedro.email, null);
      assert.equal(pedro.docNumber, "1020304051");
      const luciaAgain = `${header}\nLucía Pérez;;CO;CC;1020304050;voluntario;;\n`;
      const extraRole = await participants.importCsv(event.id, Buffer.from(luciaAgain), "lucia.csv", admin.id, null);
      assert.equal(extraRole.certificateCount, 1);
      assert.equal(await prisma.participant.count({ where: { eventId: event.id, email: null } }), 2);
      assert.equal(await prisma.certificate.count({ where: { participantId: lucia.id } }), 2);

      const neither = `${header}\nSin Datos;;;;;;asistente;;\n`;
      await expectIssue(
        () => participants.importCsv(event.id, Buffer.from(neither), "vacio-id.csv", admin.id, null),
        "email",
        undefined,
        "Falta el correo o el documento: se necesita al menos uno",
      );
      const repeated = `${header}\nUno;mismo@example.org;CO;CC;1111111111;asistente;;\nDos;mismo@example.org;CO;CC;2222222222;asistente;;\n`;
      await expectIssue(
        () => participants.importCsv(event.id, Buffer.from(repeated), "repetido.csv", admin.id, null),
        "email",
        undefined,
        "El correo mismo@example.org aparece en 2 personas distintas; quien lo busque verá todos sus certificados",
      );
      assert.equal(await prisma.participant.count({ where: { eventId: event.id, email: "mismo@example.org" } }), 0);
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
      if (adminId) {
        await prisma.adminUser.delete({ where: { id: adminId } });
      }
      await prisma.$disconnect();
    }
  });
});

async function expectIssue(run: () => Promise<unknown>, field: string, value?: string, message?: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    const body = error.getResponse() as { details?: { field: string; value?: string; message?: string }[] };
    assert.equal(body.details?.[0]?.field, field);
    if (value !== undefined) {
      assert.equal(body.details?.[0]?.value, value);
    }
    if (message !== undefined) {
      assert.equal(body.details?.[0]?.message, message);
    }
    return true;
  });
}
