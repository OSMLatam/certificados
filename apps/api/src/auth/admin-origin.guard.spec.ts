import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { AppEnv } from "../config/env";
import { AdminOriginGuard } from "./admin-origin.guard";

const env = { PUBLIC_BASE_URL: "http://localhost:5173" } as AppEnv;
const guard = new AdminOriginGuard(env);

describe("admin origin", () => {
  it("allows a panel change from the public origin and rejects any other", () => {
    assert.equal(guard.canActivate(context("GET", "/api/v1/admin/events")), true);
    assert.equal(guard.canActivate(context("POST", "/api/v1/public/search")), true);
    assert.equal(guard.canActivate(context("PATCH", "/api/v1/admin/events/1", "http://localhost:5173")), true);
    assert.throws(() => guard.canActivate(context("POST", "/api/v1/admin/events", "https://otro.example")), ForbiddenException);
    assert.throws(() => guard.canActivate(context("DELETE", "/api/v1/admin/events/1")), ForbiddenException);
  });
});

function context(method: string, url: string, origin?: string): ExecutionContext {
  return {
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => ({ method, originalUrl: url, headers: origin ? { origin } : {} }),
    }),
  } as ExecutionContext;
}
