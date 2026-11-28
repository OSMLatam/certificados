import { inflateSync } from "node:zlib";
import { PDFArray, PDFDict, PDFDocument, PDFObject, PDFRef, PDFStream, type PDFContext } from "pdf-lib";
import { inspectImage } from "../templates/image-file";

const ENTRY_IMAGE_BYTES = 20 * 1024 * 1024;
const PDF_STREAM_BYTES = 20 * 1024 * 1024;
const ACTIVE_PDF_ACTIONS = new Set(["JS", "JavaScript", "Launch", "SubmitForm"]);

export type CertificateFile = {
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
};

/** PNG, JPEG, or a PDF without active actions. The declared MIME is ignored. */
export async function inspectCertificateFile(
  bytes: Buffer,
  maxImageBytes = ENTRY_IMAGE_BYTES,
): Promise<{ ok: true; info: CertificateFile } | { ok: false; message: string }> {
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

/**
 * Dictionaries are walked with a PDF parser. FlateDecode streams are also
 * inflated with the declared /Length: the Adler checksum sometimes ends in CR
 * or LF, and stripping that byte breaks inflate. A file the parser could open
 * is kept when that fallback inflate fails for some other stream.
 */
async function inspectPdf(bytes: Buffer): Promise<{ ok: true; info: CertificateFile } | { ok: false; message: string }> {
  const parsed = await parsedPdfActions(bytes);
  const scanned = inspectPdfBytes(bytes);
  const rejected = parsed === "reject" || scanned === "action" || (scanned === "damaged" && parsed !== "clean");
  if (rejected) {
    return { ok: false, message: "UPLOAD_PDF_REJECTED" };
  }
  return { ok: true, info: { mimeType: "application/pdf" } };
}

async function parsedPdfActions(bytes: Buffer): Promise<"reject" | "clean" | "fallback"> {
  try {
    const document = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
      capNumbers: true,
    });
    if (document.isEncrypted) {
      return "reject";
    }
    const seen = new Set<PDFObject>();
    for (const [, object] of document.context.enumerateIndirectObjects()) {
      if (objectHasAction(object, document.context, seen)) {
        return "reject";
      }
    }
    return "clean";
  } catch {
    return "fallback";
  }
}

function objectHasAction(object: PDFObject | undefined, context: PDFContext, seen: Set<PDFObject>): boolean {
  if (!object) {
    return false;
  }
  const resolved = object instanceof PDFRef ? context.lookup(object) : object;
  if (!resolved || seen.has(resolved)) {
    return false;
  }
  seen.add(resolved);
  if (resolved instanceof PDFStream) {
    return objectHasAction(resolved.dict, context, seen);
  }
  if (resolved instanceof PDFDict) {
    for (const [key, value] of resolved.entries()) {
      if (ACTIVE_PDF_ACTIONS.has(key.decodeText())) {
        return true;
      }
      if (objectHasAction(value, context, seen)) {
        return true;
      }
    }
    return false;
  }
  if (resolved instanceof PDFArray) {
    for (let index = 0; index < resolved.size(); index += 1) {
      if (objectHasAction(resolved.get(index), context, seen)) {
        return true;
      }
    }
  }
  return false;
}

function inspectPdfBytes(bytes: Buffer): "ok" | "action" | "damaged" {
  const source = bytes.toString("latin1");
  const views = [source];
  const marker = /\/FlateDecode\b[\s\S]{0,800}?stream(?:\r\n|\n|\r)/g;
  for (const match of source.matchAll(marker)) {
    const dataStart = (match.index ?? 0) + match[0].length;
    const streamAt = source.lastIndexOf("stream", dataStart - 1);
    const dict = streamDictionary(source, streamAt);
    const length = directStreamLength(dict);
    const exact = length === null ? null : sliceLength(bytes, dataStart, length);
    const end = source.indexOf("endstream", dataStart);
    const spanned = end < 0 ? null : bytes.subarray(dataStart, end);
    const inflated = inflateFlate(exact, spanned);
    if (!inflated) {
      return "damaged";
    }
    views.push(inflated.toString("latin1"));
  }
  if (views.some((view) => hasActivePdfAction(view))) {
    return "action";
  }
  return "ok";
}

/** `/Length 319` is a count. `/Length 12 0 R` is an indirect object. */
function directStreamLength(dict: string): number | null {
  const match = /\/Length\s+(\d+)(?!\s+\d+\s+R\b)/.exec(dict);
  if (!match) {
    return null;
  }
  const length = Number(match[1]);
  if (!Number.isInteger(length) || length < 0 || length > PDF_STREAM_BYTES) {
    return null;
  }
  return length;
}

function streamDictionary(source: string, streamAt: number): string {
  const floor = Math.max(0, streamAt - 2000);
  let depth = 0;
  for (let index = streamAt - 1; index >= floor; index -= 1) {
    const pair = source.slice(index, index + 2);
    if (pair === ">>") {
      depth += 1;
      continue;
    }
    if (pair === "<<") {
      if (depth === 0) {
        return source.slice(index, streamAt);
      }
      depth -= 1;
    }
  }
  return source.slice(floor, streamAt);
}

function sliceLength(bytes: Buffer, start: number, length: number): Buffer | null {
  if (start < 0 || start + length > bytes.length) {
    return null;
  }
  return bytes.subarray(start, start + length);
}

function inflateFlate(exact: Buffer | null, spanned: Buffer | null): Buffer | null {
  if (exact) {
    const inflated = tryInflate(exact);
    if (inflated) {
      return inflated;
    }
  }
  if (!spanned) {
    return null;
  }
  const trimmed = trimOneNewline(spanned);
  const fromTrimmed = tryInflate(trimmed);
  if (fromTrimmed) {
    return fromTrimmed;
  }
  if (trimmed.length !== spanned.length) {
    return tryInflate(spanned);
  }
  return null;
}

function trimOneNewline(data: Buffer): Buffer {
  if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
    return data.subarray(0, -2);
  }
  if (data.length >= 1 && (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d)) {
    return data.subarray(0, -1);
  }
  return data;
}

function tryInflate(data: Buffer): Buffer | null {
  try {
    return inflateSync(data, { maxOutputLength: PDF_STREAM_BYTES });
  } catch {
    return null;
  }
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
