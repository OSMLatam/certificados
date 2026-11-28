import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importSummary } from "./import-summary";

describe("import summary", () => {
  it("counts people and certificates", () => {
    assert.equal(importSummary(33, 44), "Se importaron 33 participantes, 44 certificados.");
    assert.equal(importSummary(1, 1), "Se importaron 1 participante, 1 certificado.");
  });
});