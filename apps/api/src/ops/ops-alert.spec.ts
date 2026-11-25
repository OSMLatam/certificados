import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPS_ALERT_QUIET_MS, opsMessage, opsSignature, shouldNotify, type OpsSnapshot } from "./ops-alert";

const quiet: OpsSnapshot = { readyDown: false, failed: 0, stuck: 0 };

describe("ops alert decision", () => {
  it("stays silent when nothing is wrong, including a lazy pending", () => {
    assert.equal(shouldNotify(null, quiet, 0), false);
  });

  it("notifies once for a failed certificate and waits 24 hours unless the count rises", () => {
    const failed = { ...quiet, failed: 1 };
    assert.equal(shouldNotify(null, failed, 0), true);
    const sent = { snapshot: failed, at: 0 };
    assert.equal(shouldNotify(sent, failed, OPS_ALERT_QUIET_MS - 1), false);
    assert.equal(shouldNotify(sent, { ...quiet, failed: 2 }, 1), true);
    assert.equal(shouldNotify(sent, failed, OPS_ALERT_QUIET_MS), true);
  });

  it("does not repeat a lower count inside the quiet window", () => {
    const sent = { snapshot: { ...quiet, failed: 3, stuck: 2 }, at: 0 };
    assert.equal(shouldNotify(sent, { ...quiet, failed: 1, stuck: 2 }, 1_000), false);
  });

  it("adds a stuck pending and a down ready check as new signals", () => {
    const sent = { snapshot: { ...quiet, failed: 1 }, at: 0 };
    assert.equal(shouldNotify(sent, { ...quiet, failed: 1, stuck: 1 }, 1_000), true);
    assert.equal(shouldNotify(sent, { readyDown: true, failed: 1, stuck: 0 }, 1_000), true);
    assert.equal(opsSignature({ readyDown: true, failed: 2, stuck: 1 }), "ready failed:2 stuck:1");
  });

  it("writes counts and the review hint without holder data", () => {
    const text = opsMessage({ readyDown: false, failed: 2, stuck: 1 });
    assert.match(text, /Certificados fallidos: 2/);
    assert.match(text, /Pendientes atascados: 1/);
    assert.match(text, /retry-issue/);
    assert.equal(text.includes("@"), false);
  });
});
