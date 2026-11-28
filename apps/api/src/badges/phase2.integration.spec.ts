import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config as loadDotenv } from "dotenv";
import { minimalCertificateLayout } from "@certificados/shared";
import { loadEnv, type AppEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PdfService } from "../pdf/pdf.service";
import { EventAccess } from "../events/event-access";
import { EventsService } from "../events/events.service";
import { ParticipantsService } from "../participants/participants.service";
import { EraseService } from "../participants/erase.service";
import { IssueService } from "../certificates/issue.service";
import { permalinkPage } from "../certificates/permalink-page";
import { chromeFromEnv } from "../certificates/public-chrome-env";
import { LegalService } from "../legal/legal.service";
import { LEGAL_ROW_ID } from "../legal/legal-snapshot";
import { revokeBadgeOnly } from "./badge-sync";
import { assertionJson, issuerJson, publicBadge, revocationsJson, verifyCertificate } from "./badge-documents";
import { badgePage } from "./badge-page";

loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });
const env = loadEnv();

describe("phase 2 badges and legal snapshot", () => {
  const ac3Env = { ...env, INSTANCE: "ac3" } as AppEnv;
  const prisma = new PrismaService();
  const storage = new StorageService(env);
  const pdf = new PdfService(env);
  const ac3Pdf = new PdfService(ac3Env);
  const access = new EventAccess(prisma);
  const events = new EventsService(prisma, access);
  const participants = new ParticipantsService(env, prisma, access);
  const issue = new IssueService(env, prisma, storage, pdf);
  const ac3 = new IssueService(ac3Env, prisma, storage, ac3Pdf);
  const legal = new LegalService(ac3Env, prisma);
  const erase = new EraseService(prisma, storage);

  it("issues a badge with the certificate, keeps the legal snapshot, and revokes only the badge when asked", { timeout: 120_000 }, async () => {
    const stamp = Date.now();
    const email = `fase2-${stamp}@example.org`;
    let eventId = "";
    let adminId = "";
    let previousLegal: { nit: string; lastFolio: number; disclaimer: string } | null = null;
    try {
      await storage.ping();
      const admin = await prisma.adminUser.create({
        data: { osmId: BigInt(stamp), osmUsername: `fase2-${stamp}`, role: "admin" },
      });
      adminId = admin.id;
      const draft = await events.create(admin.id, {
        name: "Fase 2",
        year: 2026,
        startDate: "2026-11-22",
        countryCode: "CO",
        allowedRoles: ["asistente", "voluntario"],
      });
      eventId = draft.id;
      const classes = await prisma.badgeClass.findMany({ where: { eventId }, orderBy: { roleCode: "asc" } });
      assert.deepEqual(classes.map((item) => item.roleCode), ["asistente", "voluntario"]);
      const renamed = await events.update(admin.id, eventId, { name: "Fase 2 bis" }, null);
      assert.equal(renamed.name, "Fase 2 bis");
      const renamedClass = await prisma.badgeClass.findFirst({ where: { eventId, roleCode: "asistente" } });
      assert.equal(renamedClass?.code, classes.find((item) => item.roleCode === "asistente")?.code);
      assert.match(renamedClass?.name ?? "", /Fase 2 bis/);
      const layout = minimalCertificateLayout();
      layout.layers.push({
        field: "legal.nit",
        x: 80,
        y: 200,
        fontFamily: "Liberation Sans",
        fontSize: 28,
        align: "left",
        color: "#111111",
      });
      const template = await prisma.certificateTemplate.create({
        data: { eventId, roleCode: null, name: "General", layout },
      });
      await prisma.event.update({ where: { id: eventId }, data: { defaultTemplateId: template.id, status: "active" } });

      const created = await participants.create(eventId, {
        fullName: "Ada Lovelace",
        email,
        roles: ["asistente", "voluntario"],
      });
      const assistant = created.certificates.find((certificate) => certificate.roleCode === "asistente");
      const volunteer = created.certificates.find((certificate) => certificate.roleCode === "voluntario");
      assert.ok(assistant && volunteer);

      const pendingBadge = await prisma.badgeAssertion.findUnique({ where: { certificateId: assistant.id } });
      assert.equal(pendingBadge?.status, "pending");
      const viewed = await publicBadge(prisma, env.PUBLIC_BASE_URL, pendingBadge!.slug, env.SITE_NAME);
      assert.equal(viewed?.status, "pending");
      const stillPending = await prisma.certificate.findUnique({ where: { id: assistant.id } });
      assert.equal(stillPending?.status, "pending");

      const before = await prisma.instanceLegal.findUniqueOrThrow({ where: { id: LEGAL_ROW_ID } });
      previousLegal = { nit: before.nit, lastFolio: before.lastFolio, disclaimer: before.disclaimer };
      await prisma.instanceLegal.update({ where: { id: LEGAL_ROW_ID }, data: { nit: "NITAC3PRUEBA" } });

      const fileBody = Buffer.from("%PDF-1.4\n% pregenerated\n");
      const storageKey = `tests/fase2-${stamp}.pdf`;
      await storage.put(storageKey, fileBody, "application/pdf");
      const stored = await prisma.storedFile.create({
        data: {
          storageKey,
          mimeType: "application/pdf",
          byteSize: BigInt(fileBody.length),
          checksumSha256: "a".repeat(64),
        },
      });
      await prisma.certificate.update({
        where: { id: volunteer.id },
        data: { mode: "pregenerated", storedFileId: stored.id, templateId: null },
      });

      const issuedVolunteer = await ac3.metadata(volunteer.slug, "fase2-spec", undefined);
      assert.equal(issuedVolunteer.status, "issued");
      assert.equal(issuedVolunteer.legal?.nit, "NITAC3PRUEBA");
      const volunteerRow = await prisma.certificate.findUnique({ where: { id: volunteer.id }, include: { storedFile: true } });
      assert.equal(volunteerRow?.storedFile?.checksumSha256.trim(), "a".repeat(64));
      const volunteerBytes = await storage.get(storageKey);
      assert.equal(volunteerBytes.equals(fileBody), true);
      const volunteerSnapshot = volunteerRow?.legalSnapshot as { nit?: string; signers?: unknown[] } | null;
      assert.equal(volunteerSnapshot?.nit, "NITAC3PRUEBA");
      assert.ok(Array.isArray(volunteerSnapshot?.signers));

      const issuedAssistant = await ac3.metadata(assistant.slug, "fase2-spec", undefined);
      assert.equal(issuedAssistant.status, "issued");
      const assistantRow = await prisma.certificate.findUnique({ where: { id: assistant.id }, include: { storedFile: true, badgeAssertion: true } });
      assert.equal(assistantRow?.badgeAssertion?.status, "issued");
      assert.equal((assistantRow?.legalSnapshot as { nit?: string } | null)?.nit, "NITAC3PRUEBA");
      assert.equal(assistantRow?.folio, (volunteerRow?.folio ?? 0) + 1);
      const pdfBytes = await storage.get(assistantRow!.storedFile!.storageKey);
      const dir = mkdtempSync(path.join(tmpdir(), "fase2-"));
      const pdfPath = path.join(dir, "certificado.pdf");
      writeFileSync(pdfPath, pdfBytes);
      const extracted = execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
      assert.match(extracted, /NITAC3PRUEBA/);

      await legal.patch(admin.id, { nit: "NITNUEVO", signers: [{ slot: 2, name: "Luis Gómez", title: "Secretario" }] }, null);
      const afterPatch = await prisma.certificate.findUnique({ where: { id: assistant.id } });
      assert.equal((afterPatch?.legalSnapshot as { nit?: string } | null)?.nit, "NITAC3PRUEBA");
      const signers = await prisma.instanceLegalSigner.findMany({ where: { instanceLegalId: LEGAL_ROW_ID }, orderBy: { slot: "asc" } });
      assert.deepEqual(signers.map((signer) => signer.slot), [2]);

      const verified = await verifyCertificate(prisma, env.PUBLIC_BASE_URL, assistant.slug);
      assert.equal(verified?.valid, true);
      assert.equal(verified?.checksum_sha256, assistantRow?.storedFile?.checksumSha256.trim());
      assert.ok(verified?.permalink.endsWith(`/c/${assistant.slug}`));

      const issuer = await issuerJson(prisma, env.PUBLIC_BASE_URL, env.SITE_NAME, env.PRIVACY_CONTACT_EMAIL);
      assert.equal(String(issuer.revocationList).endsWith("/badges/revocations.json"), true);

      await issue.revoke(admin.id, assistant.id, "duplicado", "127.0.0.1");
      const revokedBadge = await prisma.badgeAssertion.findUnique({ where: { certificateId: assistant.id } });
      assert.equal(revokedBadge?.status, "revoked");
      assert.equal(revokedBadge?.assertionJson, null);
      const document = await assertionJson(prisma, env.PUBLIC_BASE_URL, revokedBadge!.uuid);
      assert.equal(document?.revoked, true);
      const list = await revocationsJson(prisma, env.PUBLIC_BASE_URL);
      const listed = list.revokedAssertions as { id: string }[];
      assert.equal(listed.some((item) => item.id.includes(revokedBadge!.uuid)), true);
      const audit = await prisma.auditLog.findFirst({ where: { entityId: assistant.id, action: "certificate_revoke" } });
      assert.ok(audit);

      const again = await participants.create(eventId, {
        fullName: "Ada Lovelace",
        email,
        roles: ["asistente"],
        activityTitle: "Otro taller",
      });
      const replacement = again.certificates.find((certificate) => certificate.activityTitle === "Otro taller");
      assert.ok(replacement);
      assert.notEqual(replacement.slug, assistant.slug);

      const osmClass = await prisma.badgeClass.create({
        data: {
          code: `osm-${stamp}`,
          type: "osm_activity",
          name: "Mapeo",
          description: "Actividad OSM",
          criteriaNarrative: "Participó en un mapeo.",
          externalSource: "custom",
        },
      });
      const osmBadge = await prisma.badgeAssertion.create({
        data: {
          badgeClassId: osmClass.id,
          recipientName: "Mapeante",
          recipientSalt: "abc",
          slug: `osm${String(stamp).slice(-8)}`,
          status: "issued",
        },
      });
      const certificatesBefore = await prisma.certificate.count({ where: { eventId } });
      assert.equal(await revokeBadgeOnly(prisma, osmBadge.id, "retirada", new Date()), true);
      assert.equal(await prisma.certificate.count({ where: { eventId } }), certificatesBefore);
      const osmAfter = await prisma.badgeAssertion.findUnique({ where: { id: osmBadge.id } });
      assert.equal(osmAfter?.status, "revoked");

      await prisma.permalinkAccessLog.create({ data: { certificateId: volunteer.id, userAgent: "fase2" } });
      await erase.erase(admin.id, created.id, "127.0.0.1");
      const erased = await prisma.participant.findUnique({ where: { id: created.id } });
      assert.equal(erased?.email, null);
      assert.equal(erased?.fullName, "Persona borrada");
      const reused = await participants.create(eventId, { fullName: "Otra Persona", email, roles: ["voluntario"] });
      assert.equal(reused.email, email);
      const logs = await prisma.permalinkAccessLog.count({ where: { certificateId: volunteer.id } });
      assert.equal(logs, 0);

      const page = permalinkPage(assistant.slug, chromeFromEnv(env), env.PRIVACY_CONTACT_EMAIL, `${env.PUBLIC_BASE_URL}/c/${assistant.slug}`);
      assert.match(page, /property="og:url"/);
      assert.match(page, /property="og:title"/);
      const badgeHtml = badgePage(
        pendingBadge.slug,
        chromeFromEnv(env),
        env.PRIVACY_CONTACT_EMAIL,
        `${env.PUBLIC_BASE_URL}/b/${pendingBadge.slug}`,
        { "@context": "https://w3id.org/openbadges/v2", type: "Assertion", evidence: [{ id: `${env.PUBLIC_BASE_URL}/c/${assistant.slug}` }] },
      );
      assert.match(badgeHtml, /property="og:url"/);
      assert.match(badgeHtml, /application\/ld\+json/);
      assert.match(badgeHtml, /Agregar a Badgr/);
    } finally {
      if (previousLegal) {
        await prisma.instanceLegalSigner.deleteMany({ where: { instanceLegalId: LEGAL_ROW_ID } });
        await prisma.instanceLegal.update({
          where: { id: LEGAL_ROW_ID },
          data: { nit: previousLegal.nit, lastFolio: previousLegal.lastFolio, disclaimer: previousLegal.disclaimer },
        });
      }
      if (eventId) {
        const certificates = await prisma.certificate.findMany({ where: { eventId }, include: { storedFile: true } });
        for (const certificate of certificates) {
          if (certificate.storedFile) {
            await storage.delete(certificate.storedFile.storageKey).catch(() => undefined);
          }
        }
        const fileIds = certificates.flatMap((certificate) => (certificate.storedFileId ? [certificate.storedFileId] : []));
        await prisma.badgeAssertion.deleteMany({ where: { badgeClass: { code: { startsWith: "osm-" } } } });
        await prisma.certificate.deleteMany({ where: { eventId } });
        await prisma.storedFile.deleteMany({ where: { id: { in: fileIds } } });
        await prisma.badgeClass.deleteMany({ where: { eventId } });
        await prisma.participant.deleteMany({ where: { eventId } });
        await prisma.venue.deleteMany({ where: { eventId } });
        await prisma.event.update({ where: { id: eventId }, data: { defaultTemplateId: null } }).catch(() => undefined);
        await prisma.certificateTemplate.deleteMany({ where: { eventId } });
        await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: eventId }, { adminUserId: adminId }] } });
        await prisma.event.delete({ where: { id: eventId } }).catch(() => undefined);
      }
      await prisma.badgeClass.deleteMany({ where: { code: { startsWith: "osm-" } } });
      if (adminId) {
        await prisma.adminUser.delete({ where: { id: adminId } }).catch(() => undefined);
      }
      await pdf.onModuleDestroy();
      await ac3Pdf.onModuleDestroy();
      await prisma.$disconnect();
    }
  });
});
