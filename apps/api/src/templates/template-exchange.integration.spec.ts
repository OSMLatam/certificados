import "reflect-metadata";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { config as loadDotenv } from "dotenv";
import { buildTemplatePackage, minimalCertificateLayout } from "@certificados/shared";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { EventAccess } from "../events/event-access";
import { EventsService } from "../events/events.service";
import { writeStoredZip } from "./stored-zip";
import { TemplatesService } from "./templates.service";

loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });
const env = loadEnv();

describe("template export and import", () => {
  const prisma = new PrismaService();
  const storage = new StorageService(env);
  const events = new EventsService(prisma, new EventAccess(prisma));
  const templates = new TemplatesService(env, prisma, new EventAccess(prisma), storage);

  it("copies a layout to another event and rejects a bad package", async () => {
    const createdIds: string[] = [];
    let adminId = "";
    try {
      const admin = await prisma.adminUser.create({
        data: { osmId: BigInt(Date.now()), osmUsername: "template-exchange", role: "admin" },
      });
      adminId = admin.id;
      const origin = await events.create(admin.id, {
        name: "Evento origen",
        year: 2026,
        startDate: "2026-12-01",
        countryCode: "CO",
        allowedRoles: ["asistente"],
      });
      const target = await events.create(admin.id, {
        name: "Evento destino",
        year: 2026,
        startDate: "2026-12-02",
        countryCode: "CO",
        allowedRoles: ["asistente"],
      });
      createdIds.push(origin.id, target.id);
      const source = await templates.create(origin.id, { name: "General" });
      const destination = await templates.create(target.id, { name: "General" });
      const moved = {
        ...(source.layout as object),
        layers: (source.layout as { layers: { field: string; x: number }[] }).layers.map((layer) =>
          layer.field === "full_name" ? { ...layer, x: 240 } : layer,
        ),
      };
      await templates.updateLayout(origin.id, source.id, moved);
      const exported = await templates.exportPackage(origin.id, source.id, admin.id, null);
      const imported = await templates.importPackage(target.id, destination.id, { filename: exported.filename, bytes: exported.body }, false, admin.id, null);
      const again = (imported.layout as { layers: { field: string; x: number }[] }).layers.find((layer) => layer.field === "full_name");
      assert.equal(again?.x, 240);
      const actions = await prisma.auditLog.findMany({
        where: { entityId: { in: [source.id, destination.id] } },
        orderBy: { createdAt: "asc" },
      });
      assert.deepEqual(
        actions.map((row) => row.action),
        ["template_export", "template_import"],
      );

      const invalid = buildTemplatePackage(minimalCertificateLayout(), {
        exportedAt: "2026-11-24T00:00:00.000Z",
        instance: "osm_lat",
        sourceEventName: "Evento origen",
        roleCode: null,
      });
      const broken = invalid.layers[0];
      if (!broken || broken.field === "permalink_qr") {
        throw new Error("expected a text layer");
      }
      broken.color = "azul";
      await assert.rejects(
        () => templates.importPackage(target.id, destination.id, { filename: "plantilla.json", bytes: Buffer.from(JSON.stringify(invalid)) }, false, admin.id, null),
        (error: unknown) => {
          assert.equal(error instanceof BadRequestException, true);
          const body = (error as BadRequestException).getResponse() as { details: { field: string; message: string }[] };
          assert.equal(body.details.some((detail) => detail.field === "layers[0].color" && detail.message === "debe ser #RRGGBB."), true);
          return true;
        },
      );

      const external = buildTemplatePackage(minimalCertificateLayout(), {
        exportedAt: "2026-11-24T00:00:00.000Z",
        instance: "osm_lat",
        sourceEventName: "Evento origen",
        roleCode: null,
      });
      const named = external.layers[0];
      if (!named || named.field === "permalink_qr") {
        throw new Error("expected a text layer");
      }
      named.fontFamily = "https://example.test/font.ttf" as typeof named.fontFamily;
      await assert.rejects(
        () => templates.importPackage(target.id, destination.id, { filename: "plantilla.json", bytes: Buffer.from(JSON.stringify(external)) }, false, admin.id, null),
        (error: unknown) => error instanceof BadRequestException,
      );

      const slipped = writeStoredZip([{ name: "../layout.json", bytes: Buffer.from("{}") }]);
      await assert.rejects(
        () => templates.importPackage(target.id, destination.id, { filename: "malo.zip", bytes: slipped }, false, admin.id, null),
        (error: unknown) => {
          assert.equal(error instanceof BadRequestException, true);
          const body = (error as BadRequestException).getResponse() as { details: { message: string }[] };
          assert.equal(body.details.some((detail) => detail.message.includes("ruta no permitida")), true);
          return true;
        },
      );
    } finally {
      const rows = createdIds.length ? await prisma.certificateTemplate.findMany({ where: { eventId: { in: createdIds } } }) : [];
      const templateIds = rows.map((row) => row.id);
      if (templateIds.length) {
        await prisma.auditLog.deleteMany({ where: { entityId: { in: templateIds } } });
      }
      for (const eventId of createdIds) {
        await prisma.event.update({ where: { id: eventId }, data: { defaultTemplateId: null } }).catch(() => undefined);
        await prisma.certificateTemplate.deleteMany({ where: { eventId } });
        await prisma.event.delete({ where: { id: eventId } }).catch(() => undefined);
      }
      if (adminId) {
        await prisma.adminUser.delete({ where: { id: adminId } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });
});
