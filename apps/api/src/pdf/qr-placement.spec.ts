import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import QRCode from "qrcode";
import puppeteer from "puppeteer-core";
import type { CertificateLayout } from "@certificados/shared";
import { renderCertificateHtml, type CertificateValues } from "./certificate-html";

const values: CertificateValues = {
  full_name: "Ada Lovelace",
  document: "",
  role_label: "",
  activity_title: "",
  event_name: "",
  venue_name: "",
  event_date: "",
  certificate_slug: "",
  permalink: "https://certificados.osm.lat/c/abcdefghij12",
};

describe("QR placement in the PDF", () => {
  it("draws a QR of size 100 and 200 at the layout corner, within 2 px at 150 dpi", async () => {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    try {
      await expectQr(browser, { x: 180, y: 240, size: 100 });
      await expectQr(browser, { x: 420, y: 360, size: 200 });
    } finally {
      await browser.close();
    }
  });
});

async function expectQr(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  box: { x: number; y: number; size: number },
): Promise<void> {
  const svg = await QRCode.toString("https://certificados.osm.lat/c/abcdefghij12", {
    type: "svg",
    margin: 0,
    width: box.size,
  });
  const html = renderCertificateHtml({ layout: qrLayout(box), values, qrSvg: svg, fontFaceCss: "" });
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    const pdf = Buffer.from(
      await page.pdf({ width: "297mm", height: "210mm", printBackground: true, preferCSSPageSize: true, timeout: 30_000 }),
    );
    const raster = rasterize(pdf);
    const found = darkBounds(raster);
    assert.ok(found, `no dark pixels for a QR of size ${box.size}`);
    assert.ok(Math.abs(found.width - box.size) <= 2, `width ${found.width} for size ${box.size}`);
    assert.ok(Math.abs(found.height - box.size) <= 2, `height ${found.height} for size ${box.size}`);
    assert.ok(Math.abs(found.left - box.x) <= 2, `left ${found.left} for x ${box.x}`);
    assert.ok(Math.abs(found.top - box.y) <= 2, `top ${found.top} for y ${box.y}`);
  } finally {
    await page.close();
  }
}

function qrLayout(box: { x: number; y: number; size: number }): CertificateLayout {
  return {
    canvas: { width: 1754, height: 1240, unit: "px", paper: "A4", dpi: 150, orientation: "landscape" },
    layers: [{ field: "permalink_qr", x: box.x, y: box.y, size: box.size }],
  };
}

function rasterize(pdf: Buffer): { width: number; height: number; pixels: Buffer } {
  const dir = mkdtempSync(path.join(tmpdir(), "qr-pdf-"));
  try {
    const input = path.join(dir, "certificate.pdf");
    writeFileSync(input, pdf);
    execFileSync("pdftoppm", ["-r", "150", "-singlefile", input, path.join(dir, "page")]);
    return readPpm(readFileSync(path.join(dir, "page.ppm")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readPpm(file: Buffer): { width: number; height: number; pixels: Buffer } {
  assert.equal(file.subarray(0, 2).toString("ascii"), "P6");
  let offset = 2;
  const tokens: string[] = [];
  while (tokens.length < 3) {
    while (offset < file.length && (file[offset] === 32 || file[offset] === 10 || file[offset] === 13 || file[offset] === 9)) {
      offset += 1;
    }
    if (file[offset] === 35) {
      while (offset < file.length && file[offset] !== 10) offset += 1;
      continue;
    }
    const start = offset;
    while (offset < file.length && file[offset]! > 32) offset += 1;
    tokens.push(file.subarray(start, offset).toString("ascii"));
  }
  const width = Number(tokens[0]);
  const height = Number(tokens[1]);
  if (file[offset] === 10 || file[offset] === 13) offset += 1;
  return { width, height, pixels: file.subarray(offset, offset + width * height * 3) };
}

function darkBounds(image: { width: number; height: number; pixels: Buffer }): { left: number; top: number; width: number; height: number } | null {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 3;
      if (image.pixels[index]! < 128) {
        if (x < left) left = x;
        if (y < top) top = y;
        if (x > right) right = x;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}
