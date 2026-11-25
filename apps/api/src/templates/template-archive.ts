import { readCertificateZip, type ZipIssue } from "../pregenerated/zip-file";

export const MAX_TEMPLATE_ZIP_BYTES = 15 * 1024 * 1024;
const MAX_TEMPLATE_ENTRIES = 2;

export type ArchiveIssue = { field: string; message: string };

export type TemplateArchive = {
  document: unknown;
  background: { bytes: Buffer; extension: "png" | "jpg" } | null;
};

export async function readTemplateArchive(filename: string, bytes: Buffer): Promise<{ ok: true; archive: TemplateArchive } | { ok: false; issues: ArchiveIssue[] }> {
  if (isZip(bytes)) {
    return readZip(bytes);
  }
  if (filename.toLowerCase().endsWith(".json") || bytes[0] === 0x7b) {
    return readJson(bytes);
  }
  return { ok: false, issues: [{ field: "file", message: "Sube un .zip o un .json." }] };
}

async function readZip(bytes: Buffer): Promise<{ ok: true; archive: TemplateArchive } | { ok: false; issues: ArchiveIssue[] }> {
  const opened = await readCertificateZip(bytes, { maxEntries: MAX_TEMPLATE_ENTRIES, maxUncompressedBytes: MAX_TEMPLATE_ZIP_BYTES });
  if (!opened.ok) {
    return { ok: false, issues: opened.issues.map(zipMessage) };
  }
  const layout = opened.entries.find((entry) => entry.name === "layout.json");
  const background = opened.entries.find((entry) => entry.name === "background.png" || entry.name === "background.jpg");
  const unexpected = opened.entries.filter((entry) => entry !== layout && entry !== background);
  const issues: ArchiveIssue[] = [];
  if (!layout) {
    issues.push({ field: "file", message: "El ZIP no trae layout.json." });
  }
  if (unexpected.length > 0) {
    issues.push({ field: "file", message: "El ZIP solo puede traer layout.json y el fondo." });
  }
  if (!layout || issues.length > 0) {
    return { ok: false, issues };
  }
  const document = readJson(layout.bytes);
  if (!document.ok) {
    return document;
  }
  const extension = background?.name === "background.png" ? "png" : background?.name === "background.jpg" ? "jpg" : null;
  return {
    ok: true,
    archive: {
      document: document.archive.document,
      background: background && extension ? { bytes: background.bytes, extension } : null,
    },
  };
}

function readJson(bytes: Buffer): { ok: true; archive: TemplateArchive } | { ok: false; issues: ArchiveIssue[] } {
  try {
    return { ok: true, archive: { document: JSON.parse(bytes.toString("utf8")) as unknown, background: null } };
  } catch {
    return { ok: false, issues: [{ field: "layout", message: "El archivo no es JSON." }] };
  }
}

function isZip(bytes: Buffer): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function zipMessage(issue: ZipIssue): ArchiveIssue {
  if (issue.message === "ZIP_PATH") {
    return { field: "file", message: "El ZIP incluye una ruta no permitida." };
  }
  if (issue.message === "ZIP_BOMB") {
    return { field: "file", message: "El ZIP descomprimido supera 15 MB." };
  }
  return { field: issue.field, message: issue.message };
}
