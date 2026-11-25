import "reflect-metadata";
import path from "node:path";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { config as loadDotenv } from "dotenv";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import { AuthService } from "../auth/auth.service";
import { OsmOAuthClient } from "../auth/osm-oauth.client";
import { AdminRoleGuard } from "../audit/admin-role.guard";
import { UsersService } from "./users.service";

loadDotenv({ path: path.resolve(__dirname, "../../../../.env") });
const env = loadEnv();

describe("panel users", () => {
  const prisma = new PrismaService();
  const users = new UsersService(prisma);
  const guard = new AdminGuard(new AuthService(env, prisma, new OsmOAuthClient(env)));
  const roleGuard = new AdminRoleGuard();

  it("lets an admin change a role, keeps the last admin, and writes the audit row", async () => {
    const admin = await prisma.adminUser.create({
      data: { osmId: BigInt(Date.now()), osmUsername: "Admin único", role: "admin" },
    });
    const editor = await prisma.adminUser.create({
      data: { osmId: BigInt(Date.now() + 1), osmUsername: "Editor panel", role: "editor" },
    });
    const adminSession = await prisma.adminSession.create({
      data: { id: randomBytes(32).toString("hex"), adminUserId: admin.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    const editorSession = await prisma.adminSession.create({
      data: { id: randomBytes(32).toString("hex"), adminUserId: editor.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    try {
      const editorRequest = { headers: { cookie: `${env.SESSION_COOKIE_NAME}=${editorSession.id}` } };
      assert.equal(await guard.canActivate(asContext(editorRequest)), true);
      assert.throws(() => roleGuard.canActivate(asContext(editorRequest)), ForbiddenException);
      const adminRequest = { headers: { cookie: `${env.SESSION_COOKIE_NAME}=${adminSession.id}` } };
      assert.equal(await guard.canActivate(asContext(adminRequest)), true);
      assert.equal(roleGuard.canActivate(asContext(adminRequest)), true);

      await assert.rejects(() => users.update(admin.id, admin.id, { role: null }, "127.0.0.1"));
      const stillAdmin = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
      assert.equal(stillAdmin.role, "admin");
      assert.equal(await prisma.auditLog.count({ where: { entityId: admin.id } }), 0);

      const changed = await users.update(admin.id, editor.id, { role: "admin", isActive: false }, "127.0.0.1");
      assert.equal(changed.role, "admin");
      assert.equal(changed.isActive, false);
      assert.equal(changed.osmId, editor.osmId.toString());
      const audits = await prisma.auditLog.findMany({ where: { entityId: editor.id }, orderBy: { action: "asc" } });
      assert.deepEqual(
        audits.map((row) => row.action),
        ["user_activation_change", "user_role_change"],
      );
      assert.equal(JSON.stringify(audits).includes("doc_number"), false);
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [admin.id, editor.id] } } });
      await prisma.adminSession.deleteMany({ where: { id: { in: [adminSession.id, editorSession.id] } } });
      await prisma.adminUser.deleteMany({ where: { id: { in: [admin.id, editor.id] } } });
      await prisma.$disconnect();
    }
  });
});

function asContext(request: AdminRequest): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
}
