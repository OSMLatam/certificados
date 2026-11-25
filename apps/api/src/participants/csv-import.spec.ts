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
