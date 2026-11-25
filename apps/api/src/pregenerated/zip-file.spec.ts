import assert from "node:assert/strict";
import { deflateRawSync, crc32 } from "node:zlib";
import { describe, it } from "node:test";
import { readCertificateZip } from "./zip-file";

describe("readCertificateZip", () => {
  it("reads a stored file, a deflated file, and rejects a path", async () => {
    const hello = Buffer.from("hola");
    const stored = await readCertificateZip(makeZip([{ name: "hola.txt", data: hello, method: 0 }]));
    assert.equal(stored.ok, true);
    if (stored.ok) {
      assert.equal(stored.entries[0]?.bytes.toString(), "hola");
    }

    const deflated = await readCertificateZip(makeZip([{ name: "hola.txt", data: hello, method: 8 }]));
    assert.equal(deflated.ok, true);
    if (deflated.ok) {
      assert.equal(deflated.entries[0]?.bytes.toString(), "hola");
    }

    const slipped = await readCertificateZip(makeZip([{ name: "../hola.txt", data: hello, method: 0 }]));
    assert.equal(slipped.ok, false);
    if (!slipped.ok) {
      assert.equal(slipped.issues[0]?.message, "ZIP_PATH");
    }

    const folder = await readCertificateZip(
      makeZip([
        { name: "docs/", data: Buffer.alloc(0), method: 0 },
        { name: "hola.txt", data: hello, method: 0 },
      ]),
    );
    assert.equal(folder.ok, true);
    if (folder.ok) {
      assert.deepEqual(folder.entries.map((entry) => entry.name), ["hola.txt"]);
    }
  });
});

function makeZip(files: { name: string; data: Buffer; method: 0 | 8 }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const payload = file.method === 8 ? deflateRawSync(file.data) : file.data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(file.method, 8);
    local.writeUInt32LE(crc32(file.data), 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localAll = Buffer.concat([local, name, payload]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(file.method, 10);
    central.writeUInt32LE(crc32(file.data), 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(localAll);
    centrals.push(Buffer.concat([central, name]));
    offset += localAll.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}
