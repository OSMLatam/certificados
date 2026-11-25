import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maskDocument } from "./mask-document";

describe("maskDocument", () => {
  it("keeps the document type and the last four digits", () => {
    assert.equal(maskDocument("CC", "1234560010"), "CC ******0010");
    assert.equal(maskDocument("CE", "987654321"), "CE *****4321");
  });

  it("masks every digit except the last one when the number has fewer than five digits", () => {
    assert.equal(maskDocument("CC", "1234"), "CC ***4");
    assert.equal(maskDocument("TI", "7"), "TI 7");
  });

  it("returns nothing when the participant has no document", () => {
    assert.equal(maskDocument(null, null), null);
    assert.equal(maskDocument("CC", ""), null);
    assert.equal(maskDocument("", "1234560010"), null);
  });
});
