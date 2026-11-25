import { parseSemicolonRecords } from "./parse-participants";
import type { CsvIssue } from "./parse-participants";

export const PREGENERATED_CSV_HEADERS = [
  "filename",
  "full_name",
  "email",
  "country_code",
  "doc_type",
  "doc_number",
  "role",
] as const;

export type PregeneratedCsvHeader = (typeof PREGENERATED_CSV_HEADERS)[number];

export type PregeneratedCsvRow = {
  row: number;
  filename: string;
  fullName: string;
  email: string;
  countryCode: string;
  docType: string;
  docNumber: string;
  role: string;
};

const HEADER_FIELDS: Record<PregeneratedCsvHeader, keyof Omit<PregeneratedCsvRow, "row">> = {
  filename: "filename",
  full_name: "fullName",
  email: "email",
  country_code: "countryCode",
  doc_type: "docType",
  doc_number: "docNumber",
  role: "role",
};

/** UTF-8 CSV whose filename column must match one ZIP entry exactly. */
export function pregeneratedCsvTemplate(): string {
  const examples = [
    ["cert-ana-asistente.pdf", "Ana García", "ana@example.org", "CO", "CC", "1234567890", "asistente"],
    ["cert-carlos-ponente.pdf", "Carlos López", "carlos@example.org", "CO", "CE", "987654321", "ponente"],
  ];
  const lines = [PREGENERATED_CSV_HEADERS.join(";"), ...examples.map((row) => row.join(";"))];
  return `\uFEFF${lines.join("\n")}\n`;
}

export function parsePregeneratedCsv(
  text: string,
): { ok: true; rows: PregeneratedCsvRow[] } | { ok: false; issues: CsvIssue[] } {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = parseSemicolonRecords(source);
  if (!records.ok) {
    return { ok: false, issues: [{ row: 0, field: "file", message: records.message }] };
  }
  if (records.records.length === 0) {
    return { ok: false, issues: [{ row: 0, field: "file", message: "El archivo está vacío." }] };
  }
  const header = records.records[0] ?? [];
  const issues = headerIssues(header);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const indexes = new Map<PregeneratedCsvHeader, number>();
  for (const [index, name] of header.entries()) {
    indexes.set(name.trim().toLowerCase() as PregeneratedCsvHeader, index);
  }
  const rows: PregeneratedCsvRow[] = [];
  for (let index = 1; index < records.records.length; index += 1) {
    const record = records.records[index] ?? [];
    const values = Object.fromEntries(
      PREGENERATED_CSV_HEADERS.map((column) => [HEADER_FIELDS[column], (record[indexes.get(column) ?? 0] ?? "").trim()]),
    ) as Omit<PregeneratedCsvRow, "row">;
    if (PREGENERATED_CSV_HEADERS.every((column) => values[HEADER_FIELDS[column]] === "")) {
      continue;
    }
    rows.push({ row: index + 1, ...values });
  }
  if (rows.length === 0) {
    return { ok: false, issues: [{ row: 0, field: "file", message: "El archivo no tiene certificados." }] };
  }
  if (rows.length > 500) {
    return { ok: false, issues: [{ row: 0, field: "file", message: "El archivo supera 500 filas." }] };
  }
  return { ok: true, rows };
}

function headerIssues(header: string[]): CsvIssue[] {
  const issues: CsvIssue[] = [];
  const seen = new Set<string>();
  for (const name of header) {
    const key = name.trim().toLowerCase();
    if (!PREGENERATED_CSV_HEADERS.includes(key as PregeneratedCsvHeader)) {
      issues.push({ row: 1, field: key || "file", message: "Esa columna no pertenece a la plantilla." });
      continue;
    }
    if (seen.has(key)) {
      issues.push({ row: 1, field: key, message: "La columna está repetida." });
    }
    seen.add(key);
  }
  for (const required of PREGENERATED_CSV_HEADERS) {
    if (!seen.has(required)) {
      issues.push({ row: 1, field: required, message: "Falta esta columna. El separador del archivo es ;." });
    }
  }
  return issues;
}
