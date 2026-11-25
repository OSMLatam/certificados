import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectImage } from "./image-file";

const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("inspectImage", () => {
  it("reads a PNG and rejects a file that is not an image", () => {
    const png = inspectImage(png1x1);
    assert.equal(png.ok, true);
    if (png.ok) {
      assert.equal(png.info.mimeType, "image/png");
      assert.equal(png.info.width, 1);
      assert.equal(png.info.height, 1);
    }
    assert.equal(inspectImage(Buffer.from("GIF89a")).ok, false);
  });

  it("reads a JPEG frame and rejects a side above 8000 px", () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
    ]);
    const parsed = inspectImage(jpeg);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.info.width, 3);
      assert.equal(parsed.info.height, 2);
    }
    const wide = Buffer.from(png1x1);
    wide.writeUInt32BE(8001, 16);
    assert.equal(inspectImage(wide).ok, false);
  });
});
