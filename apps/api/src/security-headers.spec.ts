import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { securityHeaderOptions, securityHeaders } from "./security-headers";

describe("security headers", () => {
  it("sends the browser guards and keeps the content policy in report-only mode", () => {
    assert.equal(securityHeaderOptions.contentSecurityPolicy.reportOnly, true);
    assert.equal(securityHeaderOptions.frameguard.action, "deny");
    const headers = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string) {
        headers.set(name.toLowerCase(), value);
      },
      getHeader(name: string) {
        return headers.get(name.toLowerCase());
      },
      removeHeader(name: string) {
        headers.delete(name.toLowerCase());
      },
    };
    securityHeaders()({} as never, response as never, () => undefined);
    assert.equal(headers.get("x-frame-options"), "DENY");
    assert.equal(headers.get("x-content-type-options"), "nosniff");
    assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.match(String(headers.get("content-security-policy-report-only")), /default-src/);
    assert.equal(headers.has("content-security-policy"), false);
  });
});
