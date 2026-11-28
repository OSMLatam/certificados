import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DISCLAIMER,
  buildLegalSnapshot,
  changedLegalKeys,
  issueDateLabel,
  legalTextValues,
  nextFolio,
  type LegalSource,
} from "./legal-snapshot";

const source: LegalSource = {
  entityName: "Asociación AC3",
  nit: "900.123.456-7",
  representative: "Ana Pérez",
  issueCity: "Bogotá D.C.",
  disclaimer: DEFAULT_DISCLAIMER,
  signers: [
    { slot: 2, name: "Luis Gómez", title: "Secretario", signature_storage_key: "legal/luis.png" },
    { slot: 1, name: "Ana Pérez", title: "Presidente", signature_storage_key: "legal/ana.png" },
  ],
};

describe("legal snapshot", () => {
  it("copies the legal row, including signers, at the moment of issue", () => {
    const issuedAt = new Date("2026-09-10T19:23:00.000Z");
    const snapshot = buildLegalSnapshot(source, 142, issuedAt);
    assert.equal(snapshot.nit, "900.123.456-7");
    assert.equal(snapshot.folio, 142);
    assert.equal(snapshot.issued_at, "2026-09-10T19:23:00.000Z");
    assert.equal(snapshot.disclaimer, DEFAULT_DISCLAIMER);
    assert.deepEqual(
      snapshot.signers.map((signer) => signer.slot),
      [1, 2],
    );
    assert.equal(snapshot.signers[1]?.name, "Luis Gómez");
  });

  it("reserves the next folio once and reuses it on retry", () => {
    const first = nextFolio(null, 141);
    assert.deepEqual(first, { folio: 142, lastFolio: 142 });
    const retry = nextFolio(142, 142);
    assert.deepEqual(retry, { folio: 142, lastFolio: 142 });
    const later = nextFolio(null, 142);
    assert.equal(later.folio, 143);
  });

  it("prints an empty signer when the slot has no row, and does not renumber the rest", () => {
    const snapshot = buildLegalSnapshot({ ...source, signers: [source.signers[0]!] }, 1, new Date("2026-01-15T05:30:00.000Z"));
    const values = legalTextValues(snapshot, false);
    assert.equal(values["legal.signer.1.name"], "");
    assert.equal(values["legal.signer.2.name"], "Luis Gómez");
    assert.equal(values["legal.nit"], "900.123.456-7");
  });

  it("formats the issue date in America/Bogota and leaves the preview blank", () => {
    const issuedAt = new Date("2026-01-15T04:30:00.000Z");
    assert.equal(issueDateLabel(issuedAt), "14 de enero de 2026");
    const snapshot = buildLegalSnapshot(source, 3, issuedAt);
    const preview = legalTextValues(snapshot, true);
    assert.equal(preview["legal.folio"], "—");
    assert.equal(preview["legal.issue_date"], "—");
    const printed = legalTextValues(snapshot, false);
    assert.equal(printed["legal.issue_date"], "14 de enero de 2026");
    assert.equal(printed["legal.folio"], "3");
  });

  it("lists disclaimer among the changed keys and never last_folio", () => {
    const before = {
      entityName: "Asociación AC3",
      nit: "900.123.456-7",
      representative: "Ana Pérez",
      issueCity: "Bogotá D.C.",
      disclaimer: DEFAULT_DISCLAIMER,
    };
    const keys = changedLegalKeys(before, { ...before, disclaimer: "Otro texto." });
    assert.deepEqual(keys, ["disclaimer"]);
    assert.equal(keys.includes("last_folio"), false);
  });
});
