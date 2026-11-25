import "reflect-metadata";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config as loadDotenv } from "dotenv";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import { AuthService } from "../auth/auth.service";
import { OsmOAuthClient } from "../auth/osm-oauth.client";
import { AdminRoleGuard } from "./admin-role.guard";
import { parseAuditQuery } from "./audit-query";
import { AuditService } from "./audit.service";

loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });
const env = loadEnv();

describe("audit log", () => {
  const prisma = new PrismaService();
  const audit = new AuditService(prisma);
  const auth = new AuthService(env, prisma, new OsmOAuthClient(env));
  const sessionGuard = new AdminGuard(auth);
  const roleGuard = new AdminRoleGuard();

  it("returns the admin's rows and refuses an editor", async () => {
    const entityId = randomUUID();
    const admin = await prisma.adminUser.create({
      data: { osmId: BigInt(Date.now()), osmUsername: "Auditora", role: "admin" },
    });
    const editor = await prisma.adminUser.create({
      data: { osmId: BigInt(Date.now() + 1), osmUsername: "Editor", role: "editor" },
    });
    const adminSession = await prisma.adminSession.create({
      data: { id: randomBytes(32).toString("hex"), adminUserId: admin.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    const editorSession = await prisma.adminSession.create({
      data: { id: randomBytes(32).toString("hex"), adminUserId: editor.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    try {
      await prisma.auditLog.create({
        data: {
          adminUserId: admin.id,
          action: "participant_csv_import",
          entityType: "event",
          entityId,
          ipAddress: "127.0.0.1",
          metadata: { row_count: 4, filename: "participantes.csv" },
          createdAt: new Date("2026-06-01T12:00:00.000Z"),
        },
      });
      await prisma.auditLog.create({
        data: {
          adminUserId: admin.id,
          action: "event_soft_delete",
          entityType: "event",
          entityId,
          metadata: {},
          createdAt: new Date("2024-01-15T12:00:00.000Z"),
        },
      });

      const listed = await audit.list(parseAuditQuery({ action: "participant_csv_import", from: "2026-01-01", to: "2026-06-01" }));
      const row = listed.items.find((item) => item.entityId === entityId);
      assert.ok(row);
      assert.equal(row.action, "participant_csv_import");
      assert.equal(row.actor?.name, "Auditora");
      assert.equal(row.ipAddress, "127.0.0.1");
      assert.deepEqual(row.metadata, { row_count: 4, filename: "participantes.csv" });
      assert.equal(JSON.stringify(row.metadata).includes("doc_number"), false);

      const older = await audit.list(parseAuditQuery({ to: "2024-12-31", pageSize: 100 }));
      assert.equal(older.items.some((item) => item.entityId === entityId && item.action === "event_soft_delete"), true);
      assert.equal(older.items.some((item) => item.entityId === entityId && item.action === "participant_csv_import"), false);

      const adminRequest = requestFor(adminSession.id);
      assert.equal(await sessionGuard.canActivate(asContext(adminRequest)), true);
      assert.equal(roleGuard.canActivate(asContext(adminRequest)), true);

      const editorRequest = requestFor(editorSession.id);
      assert.equal(await sessionGuard.canActivate(asContext(editorRequest)), true);
      assert.throws(() => roleGuard.canActivate(asContext(editorRequest)), ForbiddenException);

      const anonymous = requestFor("no-such-session");
      await assert.rejects(() => sessionGuard.canActivate(asContext(anonymous)));
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityId } });
      await prisma.adminSession.deleteMany({ where: { id: { in: [adminSession.id, editorSession.id] } } });
      await prisma.adminUser.deleteMany({ where: { id: { in: [admin.id, editor.id] } } });
      await prisma.$disconnect();
    }
  });

  function requestFor(sessionId: string): AdminRequest {
    return { headers: { cookie: `${env.SESSION_COOKIE_NAME}=${sessionId}` } };
  }
});

function asContext(request: AdminRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}
