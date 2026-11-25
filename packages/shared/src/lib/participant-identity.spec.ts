import { describe, expect, it } from "vitest";
import { MISSING_PARTICIPANT_IDENTITY, parseParticipantIdentity, repeatedEmailMessage } from "./participant-identity";

describe("parseParticipantIdentity", () => {
  it("accepts a document when the email is blank", () => {
    const parsed = parseParticipantIdentity({
      email: "  ",
      countryCode: "co",
      docTypeCode: "cc",
      docNumber: " 1020304050 ",
    });
    expect(parsed).toEqual({
      ok: true,
      email: null,
      document: { countryCode: "CO", docTypeCode: "CC", docNumber: "1020304050" },
    });
  });

  it("accepts an email without a document", () => {
    const parsed = parseParticipantIdentity({ email: " Ana@Mail.COM " });
    expect(parsed).toEqual({ ok: true, email: "ana@mail.com", document: null });
  });

  it("rejects a row that has neither", () => {
    const parsed = parseParticipantIdentity({ email: "", countryCode: "", docTypeCode: "", docNumber: "" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues).toEqual([{ field: "email", message: MISSING_PARTICIPANT_IDENTITY }]);
    }
  });

  it("keeps a malformed email as an error even when the document is complete", () => {
    const parsed = parseParticipantIdentity({
      email: "ada",
      countryCode: "CO",
      docTypeCode: "CC",
      docNumber: "1020304050",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues[0]?.message).toBe("El correo no es válido.");
    }
  });
});

describe("repeatedEmailMessage", () => {
  it("names the address and how many people share it", () => {
    expect(repeatedEmailMessage("x@y", 9)).toBe(
      "El correo x@y aparece en 9 personas distintas; quien lo busque verá todos sus certificados",
    );
  });
});
