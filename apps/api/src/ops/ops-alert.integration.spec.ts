import "reflect-metadata";
import path from "node:path";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config as loadDotenv } from "dotenv";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { OpsAlertService } from "./ops-alert.service";
import { OpsMailer } from "./ops-mailer";

loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });

describe("ops alert job", () => {
  const env = {
    ...loadEnv(),
    OPS_ALERT_EMAIL: "ops@example.org",
    OPS_ALERT_PENDING_HOURS: 24,
    SMTP_HOST: "smtp.example.org",
    SMTP_FROM: "noreply@example.org",
  };
  const prisma = new PrismaService();
  const sent: string[] = [];
  const mailer = { send: async (text: string) => { sent.push(text); } } as unknown as OpsMailer;
  const service = new OpsAlertService(env, prisma, new StorageService(env), mailer);
  const lines: string[] = [];
  service.logger = { error: (message) => lines.push(message) };

  it("logs OPS_ALERT for a failed certificate and ignores a pending one with no attempts", async () => {
    const holderEmail = "titular-secreto@example.org";
    await prisma.certificate.deleteMany({ where: { participant: { email: holderEmail } } });
    await prisma.participant.deleteMany({ where: { email: holderEmail } });
    const stale = await prisma.event.findMany({ where: { name: "Evento ops" }, select: { id: true, createdById: true } });
    if (stale.length > 0) {
      await prisma.event.deleteMany({ where: { id: { in: stale.map((item) => item.id) } } });
      await prisma.adminUser.deleteMany({ where: { id: { in: stale.map((item) => item.createdById) } } });
    }
    const admin = await prisma.adminUser.create({
      data: { osmId: BigInt(Date.now()), osmUsername: "ops-spec", role: "admin" },
    });
    const event = await prisma.event.create({
      data: {
        name: "Evento ops",
        year: 2026,
        startDate: new Date("2026-11-01T00:00:00.000Z"),
        countryCode: "CO",
        allowedRoles: ["asistente", "ponente", "tallerista", "voluntario"],
        createdById: admin.id,
      },
    });
    const participant = await prisma.participant.create({
      data: { eventId: event.id, fullName: "Titular Secreto", email: holderEmail },
    });
    const now = Date.now();
    const baseline = await service.collect(now);
    try {
      await certificate(prisma, participant.id, event.id, "asistente", { status: "failed", issueAttempts: 5, lastIssueAttemptAt: new Date(now) });
      await certificate(prisma, participant.id, event.id, "ponente", { status: "pending", issueAttempts: 0, lastIssueAttemptAt: null });
      const recent = await certificate(prisma, participant.id, event.id, "tallerista", { status: "pending", issueAttempts: 1, lastIssueAttemptAt: new Date(now - 60 * 60 * 1000) });
      const stuck = await certificate(prisma, participant.id, event.id, "voluntario", { status: "pending", issueAttempts: 2, lastIssueAttemptAt: new Date(now - 25 * 60 * 60 * 1000) });
      const after = await service.collect(now);
      assert.equal(after.failed, baseline.failed + 1);
      assert.equal(after.stuck, baseline.stuck + 1);
      await service.run(now);
      const alert = lines.find((line) => line.startsWith("OPS_ALERT failed") || line.startsWith("OPS_ALERT ready"));
      assert.ok(alert);
      assert.match(alert, /failed:\d+/);
      assert.match(alert, /stuck:\d+/);
      assert.equal(alert.includes(holderEmail), false);
      assert.equal(sent.length, 1);
      assert.equal(sent[0]?.includes(holderEmail), false);
      assert.match(sent[0] ?? "", /retry-issue/);
      assert.equal(sent[0]?.includes("privacidad"), false);

      const logged = lines.length;
      await service.run(now + 1_000);
      assert.equal(lines.length, logged);

      await prisma.certificate.deleteMany({ where: { id: { in: [recent, stuck] }, status: { in: ["failed", "pending"] } } });
      await prisma.certificate.deleteMany({ where: { participantId: participant.id, status: "failed" } });
      lines.length = 0;
      sent.length = 0;
      await service.run(now + 2_000);
      assert.equal(lines.some((line) => line.startsWith("OPS_ALERT")), false);
      assert.equal(sent.length, 0);
    } finally {
      await prisma.certificate.deleteMany({ where: { participantId: participant.id } });
      await prisma.participant.delete({ where: { id: participant.id } });
      await prisma.event.delete({ where: { id: event.id } });
      await prisma.adminUser.delete({ where: { id: admin.id } });
      await prisma.$disconnect();
    }
  });
});

async function certificate(
  prisma: PrismaService,
  participantId: string,
  eventId: string,
  roleCode: string,
  data: { status: "failed" | "pending"; issueAttempts: number; lastIssueAttemptAt: Date | null },
): Promise<string> {
  const created = await prisma.certificate.create({
    data: {
      slug: randomBytes(9).toString("base64url").slice(0, 12),
      participantId,
      eventId,
      roleCode,
      mode: "generated",
      ...data,
    },
  });
  return created.id;
}
