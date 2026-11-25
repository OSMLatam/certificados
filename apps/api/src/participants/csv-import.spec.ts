import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ParticipantCsvRow } from "@certificados/shared";
import { planParticipantImport } from "./csv-import";
import { csvBasename, extractCsvPart } from "./multipart-file";

const row = (overrides: Partial<ParticipantCsvRow> = {}): ParticipantCsvRow => ({
  row: 2,
  fullName: "Ana García",
  email: "ana@mail.com",
  countryCode: "",
  docType: "",
  docNumber: "",
  role: "asistente",
  activityTitle: "",
  venueCode: "",
  ...overrides,
});

const context = {
  instance: "osm_lat" as const,
  allowedRoles: new Set(["asistente", "voluntario"]),
  activeRoles: new Set(["asistente", "voluntario"]),
  venues: [{ id: "venue-1", code: "BOG" }],
  pregeneratedOnly: false,
  defaultTemplateId: "template-1",
  roleTemplateIds: new Map<string, string>(),
  identityRules: new Map(),
  existing: [],
};

describe("planParticipantImport", () => {
  it("keeps two roles of the same email and infers the only venue", () => {
    const planned = planParticipantImport({
      ...context,
      rows: [row(), row({ row: 3, role: "voluntario" })],
    });
    assert.equal(planned.ok, true);
    if (!planned.ok) {
      return;
    }
    assert.equal(planned.people.length, 1);
    assert.deepEqual(
      planned.people[0]?.certificates.map((certificate) => certificate.roleCode),
      ["asistente", "voluntario"],
    );
    assert.equal(planned.people[0]?.venueId, "venue-1");
  });

  it("rejects a role outside the event and a generated role without a template", () => {
    const outside = planParticipantImport({ ...context, rows: [row({ role: "extraterrestre" })] });
    assert.equal(outside.ok, false);
    if (!outside.ok) {
      assert.equal(outside.issues[0]?.field, "role");
      assert.equal(outside.issues[0]?.value, "extraterrestre");
    }
    const missing = planParticipantImport({ ...context, defaultTemplateId: null, rows: [row()] });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.issues[0]?.field, "role");
    }
  });

  it("accepts a document when the email is empty and keeps two roles on that document", () => {
    const rules = new Map([["CO|CC", { normalize: "digits" as const, validationRegex: "^[0-9]{6,10}$" }]]);
    const planned = planParticipantImport({
      ...context,
      identityRules: rules,
      rows: [
        row({ email: "", countryCode: "CO", docType: "CC", docNumber: "1020304050" }),
        row({ row: 3, email: "", role: "voluntario", countryCode: "CO", docType: "CC", docNumber: "10.203.040-50" }),
      ],
    });
    assert.equal(planned.ok, true);
    if (!planned.ok) {
      return;
    }
    assert.equal(planned.people.length, 1);
    assert.equal(planned.people[0]?.email, null);
    assert.equal(planned.people[0]?.document?.docNumber, "1020304050");
    assert.deepEqual(
      planned.people[0]?.certificates.map((certificate) => certificate.roleCode),
      ["asistente", "voluntario"],
    );
  });

  it("keeps two people without email when their documents differ", () => {
    const planned = planParticipantImport({
      ...context,
      identityRules: new Map([["CO|CC", { normalize: "digits" as const, validationRegex: "^[0-9]{6,10}$" }]]),
      rows: [
        row({ email: "", fullName: "Lucía Pérez", countryCode: "CO", docType: "CC", docNumber: "1020304050" }),
        row({ row: 3, email: "", fullName: "Pedro Gómez", countryCode: "CO", docType: "CC", docNumber: "1020304051" }),
      ],
    });
    assert.equal(planned.ok, true);
    if (!planned.ok) {
      return;
    }
    assert.equal(planned.people.length, 2);
    assert.deepEqual(
      planned.people.map((person) => person.email),
      [null, null],
    );
  });

  it("rejects a row that has neither email nor document", () => {
    const planned = planParticipantImport({ ...context, rows: [row({ email: "" })] });
    assert.equal(planned.ok, false);
    if (!planned.ok) {
      assert.equal(planned.issues[0]?.field, "email");
      assert.equal(planned.issues[0]?.message, "Falta el correo o el documento: se necesita al menos uno");
    }
  });

  it("rejects a malformed email even when the document is complete", () => {
    const planned = planParticipantImport({
      ...context,
      identityRules: new Map([["CO|CC", { normalize: "digits" as const, validationRegex: "^[0-9]{6,10}$" }]]),
      rows: [row({ email: "ada", countryCode: "CO", docType: "CC", docNumber: "1020304050" })],
    });
    assert.equal(planned.ok, false);
    if (!planned.ok) {
      assert.equal(planned.issues[0]?.message, "El correo no es válido.");
    }
  });

  it("rejects one email shared by different documents", () => {
    const planned = planParticipantImport({
      ...context,
      identityRules: new Map([["CO|CC", { normalize: "digits" as const, validationRegex: "^[0-9]{6,10}$" }]]),
      rows: [
        row({ email: "mismo@example.org", countryCode: "CO", docType: "CC", docNumber: "1111111111" }),
        row({
          row: 3,
          fullName: "Otra Persona",
          email: "mismo@example.org",
          countryCode: "CO",
          docType: "CC",
          docNumber: "2222222222",
        }),
      ],
    });
    assert.equal(planned.ok, false);
    if (!planned.ok) {
      assert.equal(
        planned.issues[0]?.message,
        "El correo mismo@example.org aparece en 2 personas distintas; quien lo busque verá todos sus certificados",
      );
    }
  });

  it("rejects a document that does not match the person already stored", () => {
    const planned = planParticipantImport({
      ...context,
      identityRules: new Map([["CO|CC", { normalize: "digits", validationRegex: "^[0-9]{6,10}$" }]]),
      existing: [
        {
          id: "person-1",
          email: "ana@mail.com",
          fullName: "Ana García",
          activityTitle: null,
          venueId: null,
          erasedAt: null,
          countryCode: "CO",
          docTypeCode: "CC",
          docNumber: "1234567890",
          roles: ["asistente"],
        },
      ],
      rows: [row({ role: "voluntario", countryCode: "CO", docType: "CC", docNumber: "12.345.678" })],
    });
    assert.equal(planned.ok, false);
    if (!planned.ok) {
      assert.equal(planned.issues[0]?.field, "doc_number");
    }
  });
});

describe("csv file envelope", () => {
  it("reads one multipart file and rejects a path in the filename", () => {
    const boundary = "----bound";
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="lista.csv"\r\nContent-Type: text/csv\r\n\r\nfull_name;email\r\n--${boundary}--\r\n`,
      "utf8",
    );
    const part = extractCsvPart(body, `multipart/form-data; boundary=${boundary}`);
    assert.equal(part.ok, true);
    if (part.ok) {
      assert.equal(part.filename, "lista.csv");
      assert.equal(part.bytes.toString("utf8"), "full_name;email");
    }
    assert.equal(csvBasename("lista.csv"), "lista.csv");
    assert.equal(csvBasename("../lista.csv"), null);
    assert.equal(csvBasename("carpeta/lista.csv"), null);
  });
});
