import { createInflateRaw } from "node:zlib";

export const MAX_ZIP_ENTRIES = 500;
export const MAX_ZIP_ENTRY_BYTES = 20 * 1024 * 1024;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;

export type ZipIssue = { field: string; message: string; value?: string };

export type ZipEntry = { name: string; bytes: Buffer };

type CentralEntry = {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  directory: boolean;
};

/**
 * Reads a ZIP from memory. Names must be basenames. Each entry is inflated
 * only up to its declared size, so a lying header cannot expand without bound.
 */
export async function readCertificateZip(
  bytes: Buffer,
  limits: { maxEntries?: number; maxUncompressedBytes?: number } = {},
): Promise<{ ok: true; entries: ZipEntry[] } | { ok: false; issues: ZipIssue[] }> {
  const maxEntries = limits.maxEntries ?? MAX_ZIP_ENTRIES;
  const maxUncompressedBytes = limits.maxUncompressedBytes ?? MAX_ZIP_UNCOMPRESSED_BYTES;
  const eocd = findEocd(bytes);
  if (eocd < 0) {
    return { ok: false, issues: [{ field: "file", message: "El archivo no es un ZIP." }] };
  }
  const entryCount = bytes.readUInt16LE(eocd + 10);
  const directorySize = bytes.readUInt32LE(eocd + 12);
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  if (
    bytes.readUInt16LE(eocd + 4) !== 0 ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff ||
    directoryOffset + directorySize > bytes.length
  ) {
    return { ok: false, issues: [{ field: "file", message: "ZIP_UNSUPPORTED" }] };
  }

  const listed = readCentralDirectory(bytes, directoryOffset, directorySize, entryCount);
  if (!listed.ok) {
    return listed;
  }
  const files = listed.entries.filter((entry) => !entry.directory);
  if (files.length > maxEntries) {
    return { ok: false, issues: [{ field: "file", message: `El ZIP supera ${maxEntries} archivos.` }] };
  }
  const issues: ZipIssue[] = [];
  const names = new Set<string>();
  let declaredTotal = 0;
  for (const entry of files) {
    if (entry.name.length === 0 || /[/\\]|\.\.|\u0000/.test(entry.name) || entry.name.startsWith("/")) {
      issues.push({ field: "file", message: "ZIP_PATH", value: entry.name });
      continue;
    }
    if (names.has(entry.name)) {
      issues.push({ field: "file", message: "ZIP_DUPLICATE", value: entry.name });
      continue;
    }
    names.add(entry.name);
    if (entry.flags & 0x1 || (entry.method !== 0 && entry.method !== 8)) {
      issues.push({ field: "file", message: "ZIP_UNSUPPORTED", value: entry.name });
      continue;
    }
    if (entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
      issues.push({ field: "file", message: "ZIP_BOMB", value: entry.name });
      continue;
    }
    if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > MAX_COMPRESSION_RATIO) {
      issues.push({ field: "file", message: "ZIP_BOMB", value: entry.name });
      continue;
    }
    if (entry.compressedSize === 0 && entry.uncompressedSize > 0) {
      issues.push({ field: "file", message: "ZIP_BOMB", value: entry.name });
      continue;
    }
    declaredTotal += entry.uncompressedSize;
    if (declaredTotal > maxUncompressedBytes) {
      issues.push({ field: "file", message: "ZIP_BOMB" });
    }
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const entries: ZipEntry[] = [];
  for (const entry of files) {
    const inflated = await inflateEntry(bytes, entry);
    if (!inflated.ok) {
      return { ok: false, issues: [inflated.issue] };
    }
    entries.push({ name: entry.name, bytes: inflated.bytes });
  }
  return { ok: true, entries };
}

function readCentralDirectory(
  bytes: Buffer,
  offset: number,
  size: number,
  entryCount: number,
): { ok: true; entries: CentralEntry[] } | { ok: false; issues: ZipIssue[] } {
  const entries: CentralEntry[] = [];
  let cursor = offset;
  const end = offset + size;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      return { ok: false, issues: [{ field: "file", message: "El ZIP está incompleto." }] };
    }
    const method = bytes.readUInt16LE(cursor + 10);
    const flags = bytes.readUInt16LE(cursor + 8);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      return { ok: false, issues: [{ field: "file", message: "ZIP_UNSUPPORTED" }] };
    }
    const nameStart = cursor + 46;
    const name = bytes.toString("utf8", nameStart, nameStart + nameLength);
    entries.push({
      name,
      method,
      flags,
      compressedSize,
      uncompressedSize,
      localOffset,
      directory: name.endsWith("/"),
    });
    cursor = nameStart + nameLength + extraLength + commentLength;
  }
  return { ok: true, entries };
}

async function inflateEntry(
  bytes: Buffer,
  entry: CentralEntry,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; issue: ZipIssue }> {
  if (entry.localOffset + 30 > bytes.length || bytes.readUInt32LE(entry.localOffset) !== 0x04034b50) {
    return { ok: false, issue: { field: "file", message: "El ZIP está incompleto.", value: entry.name } };
  }
  const nameLength = bytes.readUInt16LE(entry.localOffset + 26);
  const extraLength = bytes.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.length) {
    return { ok: false, issue: { field: "file", message: "El ZIP está incompleto.", value: entry.name } };
  }
  const compressed = bytes.subarray(start, end);
  if (entry.method === 0) {
    return { ok: true, bytes: Buffer.from(compressed) };
  }
  try {
    const inflated = await inflateLimited(compressed, entry.uncompressedSize);
    return { ok: true, bytes: inflated };
  } catch {
    return { ok: false, issue: { field: "file", message: "ZIP_BOMB", value: entry.name } };
  }
}

function inflateLimited(compressed: Buffer, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const inflater = createInflateRaw();
    const chunks: Buffer[] = [];
    let total = 0;
    inflater.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        inflater.destroy();
        reject(new Error("ZIP_BOMB"));
        return;
      }
      chunks.push(chunk);
    });
    inflater.on("error", reject);
    inflater.on("end", () => resolve(Buffer.concat(chunks)));
    inflater.end(compressed);
  });
}

function findEocd(bytes: Buffer): number {
  const start = Math.max(0, bytes.length - 22 - 65_535);
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}
