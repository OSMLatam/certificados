import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { issueErrorCode, nextIssueState } from "./issue-state";
import { isPreviewBot } from "./preview-bot";
import { PermalinkThrottle } from "./permalink-throttle";

describe("nextIssueState", () => {
  it("stays pending until the attempt limit", () => {
    assert.deepEqual(nextIssueState(3, 5), { issueAttempts: 4, status: "pending" });
    assert.deepEqual(nextIssueState(4, 5), { issueAttempts: 5, status: "failed" });
  });
});

describe("issueErrorCode", () => {
  it("keeps a short code", () => {
    assert.equal(issueErrorCode(new Error("Navigation timeout of 30000 ms exceeded")), "PDF_TIMEOUT");
    assert.equal(issueErrorCode(new Error("boom")), "PDF_RENDER");
  });
});

describe("isPreviewBot", () => {
  it("detects preview clients and leaves a browser alone", () => {
    assert.equal(isPreviewBot("WhatsApp/2.1", ""), true);
    assert.equal(isPreviewBot("Mozilla/5.0", ""), false);
    assert.equal(isPreviewBot("CustomBot", "CustomBot"), true);
  });
});

describe("PermalinkThrottle", () => {
  it("rejects the request that crosses the limit", () => {
    const throttle = new PermalinkThrottle(2, 60_000);
    assert.equal(throttle.consume("1.1.1.1", 0).ok, true);
    assert.equal(throttle.consume("1.1.1.1", 10).ok, true);
    const blocked = throttle.consume("1.1.1.1", 20);
    assert.equal(blocked.ok, false);
    assert.equal(throttle.consume("2.2.2.2", 20).ok, true);
  });
});
