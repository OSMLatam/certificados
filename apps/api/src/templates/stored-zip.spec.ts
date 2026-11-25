import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readCertificateZip } from "../pregenerated/zip-file";
import { MAX_TEMPLATE_ZIP_BYTES, readTemplateArchive } from "./template-archive";
import { writeStoredZip } from "./stored-zip";

describe("template zip", () => {
  it("rejects a path that leaves the folder and a package bigger than 15 MB", async () => {
    const slipped = writeStoredZip([{ name: "../layout.json", bytes: Buffer.from("{}") }]);
    const slip = await readTemplateArchive("plantilla.zip", slipped);
    assert.equal(slip.ok, false);
    if (!slip.ok) {
      assert.equal(slip.issues.some((issue) => issue.message.includes("ruta no permitida")), true);
    }

    const huge = writeStoredZip([{ name: "layout.json", bytes: Buffer.alloc(8) }]);
    const oversized = await readCertificateZip(huge, { maxEntries: 2, maxUncompressedBytes: 4 });
    assert.equal(oversized.ok, false);
    assert.equal(MAX_TEMPLATE_ZIP_BYTES, 15 * 1024 * 1024);
  });
});
