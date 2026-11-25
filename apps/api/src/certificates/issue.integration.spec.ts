import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { config as loadDotenv } from "dotenv";
import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { loadEnv, type AppEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PdfService } from "../pdf/pdf.service";
import { EventAccess } from "../events/event-access";
import { EventsService } from "../events/events.service";
import { ParticipantsService } from "../participants/participants.service";
import { TemplatesService } from "../templates/templates.service";
import { IssueService } from "./issue.service";

loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });
const env = loadEnv();

describe("certificate issue", () => {
  const prisma = new PrismaService();
  const storage = new StorageService(env);
  const access = new EventAccess(prisma);
  const events = new EventsService(prisma, access);
  const participants = new ParticipantsService(env, prisma, access);
  const templates = new TemplatesService(env, prisma, access, storage);
  const eventIds: string[] = [];
  const storageKeys: string[] = [];
  let adminId = "";

  it("does not render for a preview bot, dead-letters after the limit, and serves the stored PDF", { timeout: 90_000 }, async () => {
    try {
      const admin = await prisma.adminUser.create({
        data: { osmId: BigInt(Date.now()), osmUsername: "issue-spec", role: "admin" },
      });
      adminId = admin.id;
      const event = await events.create(admin.id, {
        name: "SOTM emisión",
        year: 2026,
        startDate: "2026-11-22",
        countryCode: "CO",
        allowedRoles: ["asistente"],
        status: "draft",
      });
      eventIds.push(event.id);
      const template = await templates.create(event.id, { name: "General" });
      assert.equal(template.isDefault, true);
      await events.update(admin.id, event.id, { status: "active" }, "127.0.0.1");
      const person = await participants.create(event.id, {
        fullName: "Ada Lovelace",
        email: "ada-issue@example.org",
        roles: ["asistente"],
      });
      const slug = person.certificates[0]!.slug;
      const certificateId = person.certificates[0]!.id;

      await expectConflict(() => failingIssue(env, prisma, storage).file(slug));

      const preview = await failingIssue(env, prisma, storage).metadata(slug, "WhatsApp/2.23", undefined);
      assert.equal(preview.status, "pending");
      assert.equal(preview.checksumSha256, null);
      const stillPending = await prisma.certificate.findUniqueOrThrow({ where: { id: certificateId } });
      assert.equal(stillPending.status, "pending");

      const limited = { ...env, PDF_MAX_ISSUE_ATTEMPTS: 2 };
      const brokenPdf = new CountingPdf();
      const broken = new IssueService(limited, prisma, storage, brokenPdf as unknown as PdfService);
      await assert.rejects(() => broken.metadata(slug, "Mozilla/5.0", undefined), ServiceUnavailableException);
      await assert.rejects(() => broken.metadata(slug, "Mozilla/5.0", undefined), ServiceUnavailableException);
      const dead = await broken.metadata(slug, "Mozilla/5.0", undefined);
      assert.equal(dead.status, "failed");
      assert.equal(brokenPdf.renders, 2);

      await broken.retry(admin.id, certificateId, "127.0.0.1");
      const retried = await prisma.certificate.findUniqueOrThrow({ where: { id: certificateId } });
      assert.equal(retried.status, "pending");
      assert.equal(retried.issueAttempts, 0);

      const pdf = new PdfService(env);
      const real = new IssueService(env, prisma, storage, pdf);
      const issued = await real.metadata(slug, "Mozilla/5.0", "https://certificados.osm.lat/c/" + slug);
      assert.equal(issued.status, "issued");
      assert.equal(issued.fullName, "Ada Lovelace");
      assert.equal(issued.checksumSha256?.length, 64);
      assert.ok(issued.issuedAt);
      const again = await real.metadata(slug, "Mozilla/5.0", undefined);
      assert.equal(again.issuedAt, issued.issuedAt);
      assert.equal(again.checksumSha256, issued.checksumSha256);

      const file = await real.file(slug);
      assert.equal(file.body.subarray(0, 4).toString("latin1"), "%PDF");
      assert.equal(createHash("sha256").update(file.body).digest("hex"), issued.checksumSha256);
      const pdfPath = path.join(mkdtempSync(path.join(tmpdir(), "cert-")), "cert.pdf");
      writeFileSync(pdfPath, file.body);
      assert.match(execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" }), /Pages:\s+1/);
      await pdf.onModuleDestroy();
    } finally {
      for (const eventId of eventIds) {
        const certificates = await prisma.certificate.findMany({ where: { eventId }, include: { storedFile: true } });
        for (const certificate of certificates) {
          if (certificate.storedFile) {
            storageKeys.push(certificate.storedFile.storageKey);
          }
        }
        await prisma.permalinkAccessLog.deleteMany({ where: { certificate: { eventId } } });
        await prisma.certificate.deleteMany({ where: { eventId } });
        const fileIds = certificates.flatMap((certificate) =>
          certificate.storedFileId ? [certificate.storedFileId] : [],
        );
        if (fileIds.length > 0) {
          await prisma.storedFile.deleteMany({ where: { id: { in: fileIds } } });
        }
        await prisma.participant.deleteMany({ where: { eventId } });
        await prisma.venue.deleteMany({ where: { eventId } });
        await prisma.event.update({ where: { id: eventId }, data: { defaultTemplateId: null } });
        await prisma.certificateTemplate.deleteMany({ where: { eventId } });
        await prisma.auditLog.deleteMany({ where: { entityId: eventId } });
        await prisma.event.delete({ where: { id: eventId } });
      }
      for (const key of storageKeys) {
        await storage.delete(key).catch(() => undefined);
      }
      if (adminId) {
        await prisma.auditLog.deleteMany({ where: { adminUserId: adminId } });
        await prisma.adminUser.delete({ where: { id: adminId } });
      }
      await prisma.$disconnect();
    }
  });
});

class CountingPdf {
  renders = 0;
  async render(): Promise<Buffer> {
    this.renders += 1;
    throw new Error("PDF_RENDER");
  }
  async onModuleDestroy(): Promise<void> {}
}

function failingIssue(env: AppEnv, prisma: PrismaService, storage: StorageService): IssueService {
  return new IssueService(env, prisma, storage, new CountingPdf() as unknown as PdfService);
}

async function expectConflict(run: () => Promise<unknown>): Promise<void> {
  await assert.rejects(run, ConflictException);
}
