import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { inspectCertificateFile } from "./file-kind";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("inspectCertificateFile", () => {
  it("accepts a PNG and a plain PDF, and rejects an active PDF", async () => {
    const png = await inspectCertificateFile(PNG);
    assert.equal(png.ok, true);
    if (png.ok) {
      assert.equal(png.info.mimeType, "image/png");
    }

    const plain = await inspectCertificateFile(Buffer.from("%PDF-1.1\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n"));
    assert.equal(plain.ok, true);

    const active = await inspectCertificateFile(Buffer.from("%PDF-1.1\n1 0 obj << /JavaScript (alert) >> endobj\n%%EOF\n"));
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
    const compressed = await inspectCertificateFile(hidden);
    assert.equal(compressed.ok, false);
  });

  it("accepts a FlateDecode stream whose compressed bytes end in CR", async () => {
    const compressed = deflateEndingWith(0x0d);
    const pdf = Buffer.concat([
      Buffer.from(`%PDF-1.4\n1 0 obj << /Filter /FlateDecode /Length ${compressed.length} >> stream\n`),
      compressed,
      Buffer.from("\nendstream\nendobj\n%%EOF\n"),
    ]);
    const endstream = pdf.lastIndexOf("\nendstream");
    assert.equal(pdf[endstream - 1], 0x0d);

    const accepted = await inspectCertificateFile(pdf);
    assert.equal(accepted.ok, true);

    const indirect = Buffer.concat([
      Buffer.from("%PDF-1.4\n1 0 obj << /Filter /FlateDecode /Length 9 0 R >> stream\n"),
      compressed,
      Buffer.from("\nendstream\nendobj\n%%EOF\n"),
    ]);
    const fallback = await inspectCertificateFile(indirect);
    assert.equal(fallback.ok, true);
  });

  it("rejects JavaScript stored in the document catalog", async () => {
    const document = await PDFDocument.create();
    document.addPage();
    document.addJavaScript("main", "app.alert('x')");
    const saved = Buffer.from(await document.save());
    const active = await inspectCertificateFile(saved);
    assert.equal(active.ok, false);
    if (!active.ok) {
      assert.equal(active.message, "UPLOAD_PDF_REJECTED");
    }
  });
});

function deflateEndingWith(byte: number): Buffer {
  for (let index = 0; index < 20000; index += 1) {
    const compressed = deflateSync(Buffer.from(`pagina ${index}\n`));
    if (compressed[compressed.length - 1] === byte) {
      return compressed;
    }
  }
  throw new Error(`no deflate buffer ends with ${byte}`);
}
