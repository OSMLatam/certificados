import "reflect-metadata";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config as loadDotenv } from "dotenv";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PdfService } from "../pdf/pdf.service";
import { EventAccess } from "../events/event-access";
import { EventsService } from "../events/events.service";
import { ParticipantsService } from "../participants/participants.service";
import { IssueService } from "./issue.service";

loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });
const env = loadEnv();

describe("certificate revocation", () => {
  const prisma = new PrismaService();
  const storage = new StorageService(env);
  const access = new EventAccess(prisma);
  const events = new EventsService(prisma, access);
  const participants = new ParticipantsService(env, prisma, access);
  const issue = new IssueService(env, prisma, storage, new PdfService(env));
  const eventIds: string[] = [];
  let adminId = "";

  it("hides a revoked certificate and frees the role for a new one", async () => {
    try {
      const admin = await prisma.adminUser.create({
        data: { osmId: BigInt(Date.now()), osmUsername: "revoke-spec", role: "editor" },
      });
      adminId = admin.id;
      const event = await events.create(admin.id, {
        name: "Revocación",
        year: 2026,
        startDate: "2026-12-01",
        countryCode: "CO",
        allowedRoles: ["asistente"],
        pregeneratedOnly: true,
        status: "active",
      });
      eventIds.push(event.id);
      const person = await participants.create(event.id, {
        fullName: "Ada Lovelace",
        email: "ada-revoke@example.org",
        roles: ["asistente"],
      });
      const first = person.certificates[0]!;
      const revoked = await issue.revoke(admin.id, first.id, "nombre mal escrito", "127.0.0.1");
      assert.equal(revoked.status, "revoked");
      const metadata = await issue.metadata(first.slug, "Mozilla/5.0", undefined);
      assert.equal(metadata.status, "revoked");
      assert.equal(metadata.fullName, null);
      await assert.rejects(() => issue.file(first.slug), NotFoundException);
      await assert.rejects(() => issue.revoke(admin.id, first.id, undefined, null), ConflictException);
      const replacement = await participants.create(event.id, {
        fullName: "Ada Lovelace",
        email: "ada-revoke@example.org",
        roles: ["asistente"],
      });
      const live = replacement.certificates.find((certificate) => certificate.status === "pending");
      assert.ok(live);
      assert.notEqual(live.id, first.id);
      const audit = await prisma.auditLog.findFirst({ where: { entityId: first.id, action: "certificate_revoke" } });
      assert.equal((audit?.metadata as { revoke_reason?: string }).revoke_reason, "nombre mal escrito");
    } finally {
      for (const eventId of eventIds) {
        await prisma.permalinkAccessLog.deleteMany({ where: { certificate: { eventId } } });
        await prisma.certificate.deleteMany({ where: { eventId } });
        await prisma.participant.deleteMany({ where: { eventId } });
        await prisma.auditLog.deleteMany({ where: { entityId: eventId } });
        await prisma.event.delete({ where: { id: eventId } });
      }
      if (adminId) {
        await prisma.auditLog.deleteMany({ where: { adminUserId: adminId } });
        await prisma.adminUser.delete({ where: { id: adminId } });
      }
      await prisma.$disconnect();
    }
  });
});
