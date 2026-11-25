import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAuditTime } from "./audit-time";

describe("audit time", () => {
  it("shows the Bogotá hour instead of the raw UTC timestamp", () => {
    const label = formatAuditTime("2026-11-24T05:30:00.000Z");
    assert.match(label, /00:30/);
    assert.match(label, /Bogotá/);
    assert.doesNotMatch(label, /05:30/);
  });
});
