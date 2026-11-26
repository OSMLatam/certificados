import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatIdentityRepeats, repeatedIdentities } from "./repeated-identities";

describe("repeatedIdentities", () => {
  it("lists an email or a document shared by different people and ignores a person who has both", () => {
    const groups = repeatedIdentities([
      row({ participantId: "a", fullName: "Eva Luna", email: "eva@example.org", docNumber: "100" }),
      row({ participantId: "b", fullName: "Otra Persona", email: null, docNumber: "100" }),
      row({ participantId: "c", fullName: "Ana", email: "solo@example.org", docNumber: "200" }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.kind, "document");
    assert.deepEqual(
      groups[0]?.people.map((person) => person.fullName),
      ["Eva Luna", "Otra Persona"],
    );
    const text = formatIdentityRepeats(groups);
    assert.match(text, /Documento repetido en 2 personas: CO CC 100/);
    assert.equal(formatIdentityRepeats([]), "No hay correos ni documentos repetidos entre personas distintas.\n");
  });
});

function row(overrides: Partial<Parameters<typeof repeatedIdentities>[0][number]> = {}) {
  return {
    eventId: "event-1",
    eventName: "SOTM",
    participantId: "a",
    fullName: "Ana",
    email: null as string | null,
    countryCode: "CO",
    docTypeCode: "CC",
    docNumber: "100",
    ...overrides,
  };
}
