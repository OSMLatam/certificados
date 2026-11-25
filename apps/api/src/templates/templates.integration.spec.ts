import "reflect-metadata";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config as loadDotenv } from "dotenv";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { EventAccess } from "../events/event-access";
import { EventsService } from "../events/events.service";
import { TemplatesService } from "./templates.service";

loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });
const env = loadEnv();

const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("template background and layout", () => {
  const prisma = new PrismaService();
  const storage = new StorageService(env);
  const events = new EventsService(prisma, new EventAccess(prisma));
  const templates = new TemplatesService(env, prisma, new EventAccess(prisma), storage);
  let adminId = "";
  let eventId = "";

  it("stores a PNG background and a moved layer", async () => {
    try {
      const admin = await prisma.adminUser.create({
        data: { osmId: BigInt(Date.now()), osmUsername: "template-spec", role: "admin" },
      });
      adminId = admin.id;
      const event = await events.create(admin.id, {
        name: "Plantilla",
        year: 2026,
        startDate: "2026-11-22",
        countryCode: "CO",
        allowedRoles: ["asistente"],
      });
      eventId = event.id;
      const created = await templates.create(event.id, { name: "General" });
      const withBackground = await templates.setBackground(event.id, created.id, png1x1, admin.id);
      assert.equal(withBackground.hasBackground, true);
      const file = await templates.readBackground(event.id, created.id);
      assert.equal(file.body.equals(png1x1), true);
      assert.equal(file.mimeType, "image/png");

      const layout = created.layout as { layers: { field: string; x: number }[] };
      const moved = {
        ...(created.layout as object),
        layers: layout.layers.map((layer) => (layer.field === "full_name" ? { ...layer, x: 120 } : layer)),
      };
      const updated = await templates.updateLayout(event.id, created.id, moved);
      const saved = updated.layout as { layers: { field: string; x: number }[] };
      assert.equal(saved.layers.find((layer) => layer.field === "full_name")?.x, 120);
    } finally {
      if (eventId) {
        const templatesOnEvent = await prisma.certificateTemplate.findMany({ where: { eventId } });
        const fileIds = templatesOnEvent.flatMap((template) => (template.backgroundFileId ? [template.backgroundFileId] : []));
        const files = fileIds.length ? await prisma.storedFile.findMany({ where: { id: { in: fileIds } } }) : [];
        await prisma.event.update({ where: { id: eventId }, data: { defaultTemplateId: null } });
        await prisma.certificateTemplate.deleteMany({ where: { eventId } });
        if (fileIds.length) {
          await prisma.storedFile.deleteMany({ where: { id: { in: fileIds } } });
        }
        for (const file of files) {
          await storage.delete(file.storageKey).catch(() => undefined);
        }
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
