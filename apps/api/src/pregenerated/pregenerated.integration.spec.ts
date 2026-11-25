import "reflect-metadata";
import path from "node:path";
import assert from "node:assert/strict";
import { crc32, deflateRawSync } from "node:zlib";
import { describe, it } from "node:test";
import { config as loadDotenv } from "dotenv";
import { BadRequestException } from "@nestjs/common";
import { PREGENERATED_CSV_HEADERS } from "@certificados/shared";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PdfService } from "../pdf/pdf.service";
import { EventAccess } from "../events/event-access";
import { EventsService } from "../events/events.service";
import { ParticipantsService } from "../participants/participants.service";
import { IssueService } from "../certificates/issue.service";
import { PregeneratedService } from "./pregenerated.service";

loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });
const env = loadEnv();
const header = PREGENERATED_CSV_HEADERS.join(";");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.1\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");

describe("pregenerated import", () => {
  const prisma = new PrismaService();
  const storage = new StorageService(env);
  const access = new EventAccess(prisma);
  const events = new EventsService(prisma, access);
  const participants = new ParticipantsService(env, prisma, access);
  const pregenerated = new PregeneratedService(env, prisma, access, storage);
  const issue = new IssueService(env, prisma, storage, new PdfService(env));

  it("stores a matching sheet and ZIP, and serves the file after the first visit", async () => {
    const eventIds: string[] = [];
    let adminId = "";
    try {
      const admin = await prisma.adminUser.create({
        data: { osmId: BigInt(Date.now()), osmUsername: "pregenerated-spec", role: "admin" },
      });
      adminId = admin.id;
      const event = await events.create(admin.id, {
        name: "Pregenerados",
        year: 2026,
        startDate: "2026-11-22",
        countryCode: "CO",
        allowedRoles: ["asistente", "voluntario"],
      });
      eventIds.push(event.id);
      const venue = await events.createVenue(event.id, { name: "Bogotá", code: "BOG" });
      const sheet = `${header}\nana.pdf;Ana García;ana@mail.com;CO;CC;1234567890;asistente\nana.png;Ana García;ana@mail.com;CO;CC;1234567890;voluntario\n`;
      const extra = makeZip([
        { name: "ana.pdf", data: PDF },
        { name: "ana.png", data: PNG },
        { name: "sobra.pdf", data: PDF },
      ]);
      await expectCode(
        () => pregenerated.importZip(event.id, Buffer.from(sheet), extra, "lote.csv", admin.id, "127.0.0.1"),
        "ZIP_FILE_UNEXPECTED",
      );
      assert.equal(await prisma.participant.count({ where: { eventId: event.id } }), 0);

      const missing = makeZip([{ name: "ana.pdf", data: PDF }]);
      await expectCode(
        () => pregenerated.importZip(event.id, Buffer.from(sheet), missing, "lote.csv", admin.id, null),
        "ZIP_FILE_MISSING",
      );

      const zip = makeZip([
        { name: "ana.pdf", data: PDF },
        { name: "ana.png", data: PNG },
      ]);
      const imported = await pregenerated.importZip(event.id, Buffer.from(sheet), zip, "lote.csv", admin.id, "127.0.0.1");
      assert.deepEqual(imported, { rowCount: 2, participantCount: 1, certificateCount: 2 });
      const person = await prisma.participant.findUniqueOrThrow({
        where: { eventId_email: { eventId: event.id, email: "ana@mail.com" } },
        include: { certificates: { include: { storedFile: true } } },
      });
      assert.equal(person.venueId, venue.id);
      assert.equal(person.docNumber, "1234567890");
      assert.equal(person.certificates.length, 2);
      assert.ok(
        person.certificates.every(
          (certificate) =>
            certificate.status === "pending" &&
            certificate.mode === "pregenerated" &&
            certificate.templateId === null &&
            certificate.storedFile !== null,
        ),
      );
      await expectCode(
        () => pregenerated.importZip(event.id, Buffer.from(sheet), zip, "lote.csv", admin.id, null),
        "Este correo ya tiene certificado para ese rol.",
      );
      assert.equal(await prisma.auditLog.count({ where: { entityId: event.id, action: "pregenerated_import" } }), 1);

      const archive = await events.create(admin.id, {
        name: "Solo archivos",
        year: 2026,
        startDate: "2026-11-22",
        countryCode: "CO",
        allowedRoles: ["asistente"],
        pregeneratedOnly: true,
      });
      eventIds.push(archive.id);
      const created = await participants.create(archive.id, {
        fullName: "Ada Lovelace",
        email: "ada@example.org",
        roles: ["asistente"],
      });
      const certificateId = created.certificates[0]?.id ?? "";
      const attached = await pregenerated.attachFile(certificateId, PNG, admin.id);
      assert.equal(attached.status, "pending");
      assert.equal(attached.mimeType, "image/png");
      const published = await issue.metadata(created.certificates[0]!.slug, "Mozilla", undefined);
      assert.equal(published.status, "issued");
      assert.equal(published.checksumSha256?.length, 64);
      const downloaded = await issue.file(created.certificates[0]!.slug);
      assert.equal(downloaded.mimeType, "image/png");
      assert.ok(downloaded.body.equals(PNG));
    } finally {
      for (const eventId of eventIds) {
        const certificates = await prisma.certificate.findMany({ where: { eventId }, include: { storedFile: true } });
        const keys = certificates.flatMap((certificate) => (certificate.storedFile ? [certificate.storedFile.storageKey] : []));
        const fileIds = certificates.flatMap((certificate) => (certificate.storedFileId ? [certificate.storedFileId] : []));
        await prisma.certificate.deleteMany({ where: { eventId } });
        if (fileIds.length > 0) {
          await prisma.storedFile.deleteMany({ where: { id: { in: fileIds } } });
        }
        await Promise.all(keys.map((key) => storage.delete(key).catch(() => undefined)));
        await prisma.participant.deleteMany({ where: { eventId } });
        await prisma.venue.deleteMany({ where: { eventId } });
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

function expectCode(run: () => Promise<unknown>, message: string): Promise<void> {
  return assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    const body = error.getResponse() as { details?: { message: string }[] };
    assert.ok(body.details?.some((detail) => detail.message === message));
    return true;
  });
}

function makeZip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const payload = deflateRawSync(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(file.data), 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localAll = Buffer.concat([local, name, payload]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(file.data), 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(localAll);
    centrals.push(Buffer.concat([central, name]));
    offset += localAll.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}
