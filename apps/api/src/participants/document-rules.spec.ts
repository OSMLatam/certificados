import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentPresence, documentsConflict, normalizeDocument } from "./document-rules";

describe("normalizeDocument", () => {
  const cc = { normalize: "digits" as const, validationRegex: "^[0-9]{6,10}$" };

  it("strips separators before the regex", () => {
    const result = normalizeDocument(
      { countryCode: "co", docTypeCode: "cc", docNumber: "12.345.678-9" },
      cc,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.docNumber, "123456789");
      assert.equal(result.value.countryCode, "CO");
      assert.equal(result.value.docTypeCode, "CC");
    }
  });

  it("rejects a type that is not in the catalog", () => {
    const result = normalizeDocument(
      { countryCode: "CO", docTypeCode: "PASSPORT", docNumber: "AB1234" },
      null,
    );
    assert.equal(result.ok, false);
  });
});

describe("documentsConflict", () => {
  const stored = { countryCode: "CO", docTypeCode: "CC", docNumber: "123456789" };

  it("allows filling a missing document and rejects a different one", () => {
    assert.equal(documentsConflict(null, stored), false);
    assert.equal(
      documentsConflict(stored, { ...stored, docNumber: "999999999" }),
      true,
    );
  });
});

describe("documentPresence", () => {
  it("distinguishes a partial document", () => {
    assert.equal(documentPresence({}), "absent");
    assert.equal(documentPresence({ countryCode: "CO" }), "partial");
    assert.equal(
      documentPresence({ countryCode: "CO", docTypeCode: "CC", docNumber: "1" }),
      "complete",
    );
  });
});
