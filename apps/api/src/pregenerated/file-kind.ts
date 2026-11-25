import { inflateSync } from "node:zlib";
import { inspectImage } from "../templates/image-file";

const ENTRY_IMAGE_BYTES = 20 * 1024 * 1024;
const PDF_STREAM_BYTES = 20 * 1024 * 1024;

export type CertificateFile = {
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
};

/** PNG, JPEG, or a PDF without active actions. The declared MIME is ignored. */
export function inspectCertificateFile(
  bytes: Buffer,
  maxImageBytes = ENTRY_IMAGE_BYTES,
): { ok: true; info: CertificateFile } | { ok: false; message: string } {
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("ascii") === "%PDF") {
    return inspectPdf(bytes);
  }
  if (isPng(bytes) || isJpeg(bytes)) {
    const image = inspectImage(bytes, maxImageBytes);
    if (!image.ok) {
      return { ok: false, message: "UPLOAD_IMAGE_REJECTED" };
    }
    return { ok: true, info: { mimeType: image.info.mimeType } };
  }
  return { ok: false, message: "El archivo tiene que ser PNG, JPEG o PDF." };
}

function inspectPdf(bytes: Buffer): { ok: true; info: CertificateFile } | { ok: false; message: string } {
  const views = [bytes.toString("latin1")];
  const source = views[0] ?? "";
  const marker = /\/FlateDecode\b[\s\S]{0,400}?stream\r?\n/g;
  for (const match of source.matchAll(marker)) {
    const start = (match.index ?? 0) + match[0].length;
    const end = source.indexOf("endstream", start);
    if (end < 0) {
      return { ok: false, message: "UPLOAD_PDF_REJECTED" };
    }
    let data = Buffer.from(source.slice(start, end), "latin1");
    if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
      data = data.subarray(0, -2);
    } else if (data.length >= 1 && (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d)) {
      data = data.subarray(0, -1);
    }
    try {
      views.push(inflateSync(data, { maxOutputLength: PDF_STREAM_BYTES }).toString("latin1"));
    } catch {
      return { ok: false, message: "UPLOAD_PDF_REJECTED" };
    }
  }
  if (views.some((view) => hasActivePdfAction(view))) {
    return { ok: false, message: "UPLOAD_PDF_REJECTED" };
  }
  return { ok: true, info: { mimeType: "application/pdf" } };
}

function hasActivePdfAction(value: string): boolean {
  return /\/(?:JS|JavaScript|Launch|SubmitForm)(?![A-Za-z0-9])/.test(value);
}

function isPng(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
