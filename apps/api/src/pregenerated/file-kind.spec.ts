import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { describe, it } from "node:test";
import { inspectCertificateFile } from "./file-kind";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("inspectCertificateFile", () => {
  it("accepts a PNG and a plain PDF, and rejects an active PDF", () => {
    const png = inspectCertificateFile(PNG);
    assert.equal(png.ok, true);
    if (png.ok) {
      assert.equal(png.info.mimeType, "image/png");
    }

    const plain = inspectCertificateFile(Buffer.from("%PDF-1.1\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n"));
    assert.equal(plain.ok, true);

    const active = inspectCertificateFile(Buffer.from("%PDF-1.1\n1 0 obj << /JavaScript (alert) >> endobj\n%%EOF\n"));
    assert.equal(active.ok, false);
    if (!active.ok) {
      assert.equal(active.message, "UPLOAD_PDF_REJECTED");
    }

    const hidden = Buffer.concat([
      Buffer.from("%PDF-1.4\n1 0 obj << /Filter /FlateDecode /Length "),
      Buffer.from(String(deflateSync(Buffer.from("/JS << >>")).length)),
      Buffer.from(" >> stream\n"),
      deflateSync(Buffer.from("/JS << >>")),
      Buffer.from("\nendstream\nendobj\n%%EOF\n"),
    ]);
    const compressed = inspectCertificateFile(hidden);
    assert.equal(compressed.ok, false);
  });
});
