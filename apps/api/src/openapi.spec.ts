import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { parse } from "yaml";

type Operation = { operationId?: string; responses?: Record<string, unknown> };
type Document = {
  info: { title: string; license?: { name?: string }; contact?: { url?: string } };
  externalDocs?: { url?: string };
  paths: Record<string, Record<string, Operation>>;
};

const document = parse(readFileSync(path.resolve(__dirname, "../openapi.yaml"), "utf8")) as Document;

const METHODS = ["get", "post", "patch", "delete", "put"];

describe("openapi", () => {
  it("names the software, the MIT license, and the repository", () => {
    assert.equal(document.info.title, "certificados");
    assert.equal(document.info.license?.name, "MIT");
    assert.equal(document.externalDocs?.url, "https://github.com/OSMLatam/certificados");
    assert.equal(document.info.contact?.url, "https://github.com/OSMLatam/certificados");
  });

  it("covers the phase 1 routes and leaves later phases out", () => {
    const paths = Object.keys(document.paths);
    for (const required of [
      "/health",
      "/ready",
      "/api/v1/admin/auth/me",
      "/api/v1/admin/users",
      "/api/v1/admin/users/{id}",
      "/api/v1/admin/audit-log",
      "/api/v1/admin/events",
      "/api/v1/admin/events/{id}/participants/import",
      "/api/v1/admin/events/{id}/pregenerated/import",
      "/api/v1/admin/certificates/{id}/retry-issue",
      "/api/v1/public/search",
      "/api/v1/public/certificates/{slug}",
      "/api/v1/public/certificates/{slug}/file",
    ]) {
      assert.equal(paths.includes(required), true, required);
    }
    const later = paths.filter((item) => /badge|revoke|legal|send-link|\/me/.test(item) && item !== "/api/v1/admin/auth/me");
    assert.deepEqual(later, []);
  });

  it("gives every operation a unique id", () => {
    const ids = Object.values(document.paths).flatMap((pathItem) =>
      METHODS.filter((method) => method in pathItem).map((method) => pathItem[method]?.operationId),
    );
    assert.equal(ids.every((id) => typeof id === "string" && id.length > 0), true);
    assert.equal(new Set(ids).size, ids.length);
  });
});
