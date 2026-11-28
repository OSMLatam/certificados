import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { IMPORTER_CODES, importerMessage, pdfRejectedMessage } from "./import-messages";

describe("pregenerated importer messages", () => {
  it("writes every importer code in Spanish", () => {
    const sources = ["zip-file.ts", "pregenerated.service.ts"].map((name) =>
      readFileSync(path.join(__dirname, name), "utf8"),
    );
    const used = new Set(sources.flatMap((source) => [...source.matchAll(/"ZIP_[A-Z_]+"/g)].map((match) => match[0].slice(1, -1))));
    for (const code of used) {
      assert.equal(IMPORTER_CODES.includes(code as (typeof IMPORTER_CODES)[number]), true, code);
    }
    for (const code of IMPORTER_CODES) {
      const text = importerMessage(code, "no-existe.pdf");
      assert.equal(text.includes(code), false);
      assert.equal(/^ZIP_/.test(text), false);
      assert.match(text, /[áéíóúñ]|archivo|ZIP/i);
    }
    assert.equal(importerMessage("ZIP_FILE_MISSING", "no-existe.pdf"), "El archivo no-existe.pdf está en la hoja, pero no en el ZIP");
    assert.equal(importerMessage("ZIP_FILE_UNEXPECTED", "cert-luis.pdf"), "El archivo cert-luis.pdf está en el ZIP, pero no en la hoja");
    assert.equal(
      pdfRejectedMessage(33, "sotm25-031.pdf"),
      'Fila 33: el PDF sotm25-031.pdf no se pudo validar (puede tener acciones o JavaScript, o estar dañado)',
    );
  });
});
