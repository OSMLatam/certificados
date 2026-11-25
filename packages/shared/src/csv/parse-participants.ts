export const PARTICIPANT_CSV_HEADERS = [
  "full_name",
  "email",
  "country_code",
  "doc_type",
  "doc_number",
  "role",
  "activity_title",
  "venue_code",
] as const;

export const MAX_PARTICIPANT_CSV_ROWS = 5000;

export type ParticipantCsvHeader = (typeof PARTICIPANT_CSV_HEADERS)[number];

export type ParticipantCsvRow = {
  row: number;
  fullName: string;
  email: string;
  countryCode: string;
  docType: string;
  docNumber: string;
  role: string;
  activityTitle: string;
  venueCode: string;
};

export type CsvIssue = {
  row: number;
  field: string;
  message: string;
};

const HEADER_FIELDS: Record<ParticipantCsvHeader, keyof Omit<ParticipantCsvRow, "row">> = {
  full_name: "fullName",
  email: "email",
  country_code: "countryCode",
  doc_type: "docType",
  doc_number: "docNumber",
  role: "role",
  activity_title: "activityTitle",
  venue_code: "venueCode",
};

/** UTF-8 CSV with the columns an editor fills in and uploads again. */
export function participantCsvTemplate(): string {
  const examples = [
    ["Ana García", "ana@mail.com", "CO", "CC", "1234567890", "asistente", "", ""],
    ["Ana García", "ana@mail.com", "CO", "CC", "1234567890", "voluntario", "", ""],
    ["Carlos López", "carlos@mail.com", "CO", "CE", "987654321", "ponente", "Mapping con OpenStreetMap", "BOG"],
    ["María Ruiz", "maria@example.org", "CO", "CC", "5555555555", "asistente", "", ""],
  ];
  const lines = [PARTICIPANT_CSV_HEADERS.join(";"), ...examples.map((row) => row.join(";"))];
  return `\uFEFF${lines.join("\n")}\n`;
}

export function parseParticipantCsv(text: string): { ok: true; rows: ParticipantCsvRow[] } | { ok: false; issues: CsvIssue[] } {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = parseSemicolonRecords(source);
  if (!records.ok) {
    return { ok: false, issues: [{ row: 0, field: "file", message: records.message }] };
  }
  if (records.records.length === 0) {
    return { ok: false, issues: [{ row: 0, field: "file", message: "El archivo está vacío." }] };
  }

  const headerIssues = headerIssuesFor(records.records[0] ?? []);
  if (headerIssues.length > 0) {
    return { ok: false, issues: headerIssues };
  }
  const indexes = new Map<ParticipantCsvHeader, number>();
  for (const [index, name] of (records.records[0] ?? []).entries()) {
    indexes.set(name.trim().toLowerCase() as ParticipantCsvHeader, index);
  }

  const rows: ParticipantCsvRow[] = [];
  for (let index = 1; index < records.records.length; index += 1) {
    const record = records.records[index] ?? [];
    const values = Object.fromEntries(
      PARTICIPANT_CSV_HEADERS.map((header) => [HEADER_FIELDS[header], (record[indexes.get(header) ?? 0] ?? "").trim()]),
    ) as Omit<ParticipantCsvRow, "row">;
    if (PARTICIPANT_CSV_HEADERS.every((header) => values[HEADER_FIELDS[header]] === "")) {
      continue;
    }
    rows.push({ row: index + 1, ...values });
  }
  if (rows.length === 0) {
    return { ok: false, issues: [{ row: 0, field: "file", message: "El archivo no tiene participantes." }] };
  }
  if (rows.length > MAX_PARTICIPANT_CSV_ROWS) {
    return {
      ok: false,
      issues: [{ row: 0, field: "file", message: `El archivo supera ${MAX_PARTICIPANT_CSV_ROWS} filas.` }],
    };
  }
  return { ok: true, rows };
}

function headerIssuesFor(header: string[]): CsvIssue[] {
  const issues: CsvIssue[] = [];
  const seen = new Set<string>();
  for (const name of header) {
    const key = name.trim().toLowerCase();
    if (!PARTICIPANT_CSV_HEADERS.includes(key as ParticipantCsvHeader)) {
      issues.push({ row: 1, field: key || "file", message: "Esa columna no pertenece a la plantilla." });
      continue;
    }
    if (seen.has(key)) {
      issues.push({ row: 1, field: key, message: "La columna está repetida." });
    }
    seen.add(key);
  }
  for (const required of PARTICIPANT_CSV_HEADERS) {
    if (!seen.has(required)) {
      issues.push({ row: 1, field: required, message: "Falta esta columna. El separador del archivo es ;." });
    }
  }
  return issues;
}

export function parseSemicolonRecords(text: string): { ok: true; records: string[][] } | { ok: false; message: string } {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
          continue;
        }
        quoted = false;
        continue;
      }
      field += char;
      continue;
    }
    if (char === '"') {
      if (field.length > 0) {
        return { ok: false, message: "Hay comillas fuera de un campo." };
      }
      quoted = true;
      continue;
    }
    if (char === ";") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      records.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  if (quoted) {
    return { ok: false, message: "Hay un campo entre comillas sin cerrar." };
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  return { ok: true, records };
}
