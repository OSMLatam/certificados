import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSearchQuery } from "./search-query";

describe("parseSearchQuery", () => {
  it("accepts an email or a document, and rejects everything else", () => {
    const email = parseSearchQuery({ email: " Ada@Example.ORG " });
    assert.equal(email.ok, true);
    if (email.ok) {
      assert.deepEqual(email.query, { kind: "email", email: "Ada@Example.ORG" });
    }

    const document = parseSearchQuery({ countryCode: "co", docTypeCode: "cc", docNumber: "12.345.678-9" });
    assert.equal(document.ok, true);

    const both = parseSearchQuery({ email: "ada@example.org", docNumber: "1" });
    assert.equal(both.ok, false);
    if (!both.ok) {
      assert.equal(both.details[0]?.field, "email");
    }

    const empty = parseSearchQuery({});
    assert.equal(empty.ok, false);

    const partial = parseSearchQuery({ countryCode: "CO", docNumber: "123" });
    assert.equal(partial.ok, false);
    if (!partial.ok) {
      assert.equal(partial.details[0]?.field, "docNumber");
    }

    const event = parseSearchQuery({ year: 2026 });
    assert.equal(event.ok, false);
    if (!event.ok) {
      assert.equal(event.details[0]?.message, "La búsqueda solo acepta correo o documento.");
    }
  });
});
