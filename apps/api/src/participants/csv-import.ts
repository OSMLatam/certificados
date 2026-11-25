import type { NormalizeStrategy } from "@certificados/shared";
import type { ParticipantCsvRow } from "@certificados/shared";
import { normalizeEmail } from "@certificados/shared";
import { resolveCertificateTemplate, resolveVenueId } from "../events/event-rules";
import { documentPresence, documentsConflict, normalizeDocument, type StoredDocument } from "./document-rules";

export type ImportIssue = {
  row: number;
  field: string;
  message: string;
  value?: string;
};

export type PlannedCertificate = {
  roleCode: string;
  mode: "generated" | "pregenerated";
  templateId: string | null;
  venueId: string | null;
};

export type PlannedParticipant = {
  existingId: string | null;
  email: string;
  fullName: string;
  activityTitle: string | null;
  venueId: string | null;
  document: StoredDocument | null;
  certificates: PlannedCertificate[];
};

export type ExistingParticipant = {
  id: string;
  email: string;
  fullName: string;
  activityTitle: string | null;
  venueId: string | null;
  erasedAt: Date | null;
  countryCode: string | null;
  docTypeCode: string | null;
  docNumber: string | null;
  roles: string[];
};

type IdentityRule = {
  normalize: NormalizeStrategy;
  validationRegex: string | null;
};

type Draft = {
  row: ParticipantCsvRow;
  email: string;
  document: StoredDocument | null;
  venueId: string | null;
  certificate: PlannedCertificate | null;
};

export function planParticipantImport(input: {
  instance: "osm_lat" | "ac3";
  rows: ParticipantCsvRow[];
  allowedRoles: ReadonlySet<string>;
  activeRoles: ReadonlySet<string>;
  venues: { id: string; code: string }[];
  pregeneratedOnly: boolean;
  defaultTemplateId: string | null;
  roleTemplateIds: ReadonlyMap<string, string>;
  identityRules: ReadonlyMap<string, IdentityRule>;
  existing: readonly ExistingParticipant[];
}): { ok: true; people: PlannedParticipant[] } | { ok: false; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const drafts: Draft[] = [];

  for (const row of input.rows) {
    const email = normalizeEmail(row.email);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
    if (!emailOk) {
      issues.push({ row: row.row, field: "email", message: "El correo no es válido." });
    }
    if (row.fullName.length === 0 || row.fullName.length > 255) {
      issues.push({ row: row.row, field: "full_name", message: "El nombre es obligatorio y admite hasta 255 caracteres." });
    }
    if (row.activityTitle.length > 2000) {
      issues.push({ row: row.row, field: "activity_title", message: "La actividad admite hasta 2000 caracteres." });
    }

    const role = row.role.trim().toLowerCase();
    let certificate: PlannedCertificate | null = null;
    if (role.length === 0) {
      issues.push({ row: row.row, field: "role", message: "El rol es obligatorio." });
    } else if (!input.allowedRoles.has(role)) {
      issues.push({
        row: row.row,
        field: "role",
        message: "Ese rol no está permitido en el evento.",
        value: role,
      });
    } else if (!input.activeRoles.has(role)) {
      issues.push({ row: row.row, field: "role", message: "Ese rol no está en el catálogo activo.", value: role });
    } else {
      const resolved = resolveCertificateTemplate({
        pregeneratedOnly: input.pregeneratedOnly,
        defaultTemplateId: input.defaultTemplateId,
        roleTemplateId: input.roleTemplateIds.get(role) ?? null,
      });
      if ("error" in resolved) {
        issues.push({
          row: row.row,
          field: "role",
          message: `No hay plantilla para el rol ${role}. El evento generado no puede reservar ese certificado.`,
          value: role,
        });
      } else {
        certificate = { roleCode: role, ...resolved, venueId: null };
      }
    }

    const document = resolveRowDocument(row, input, issues);
    const venue = resolveVenueId({ venueCode: row.venueCode || undefined, venues: input.venues });
    if ("error" in venue) {
      issues.push({
        row: row.row,
        field: "venue_code",
        message: "Esa sede no existe en el evento.",
        value: row.venueCode,
      });
    }
    if (certificate) {
      certificate.venueId = "error" in venue ? null : venue.venueId;
    }
    if (emailOk) {
      drafts.push({
        row,
        email,
        document,
        venueId: "error" in venue ? null : venue.venueId,
        certificate,
      });
    }
  }

  const existingByEmail = new Map(input.existing.map((person) => [person.email, person]));
  const people: PlannedParticipant[] = [];
  for (const [email, group] of groupByEmail(drafts)) {
    const current = existingByEmail.get(email) ?? null;
    if (current?.erasedAt) {
      issues.push({
        row: group[0]!.row.row,
        field: "email",
        message: "Ese correo pertenece a un participante suprimido.",
      });
      continue;
    }
    const names = new Set(group.map((item) => item.row.fullName).filter((name) => name.length > 0));
    if (names.size > 1) {
      issues.push({
        row: group[1]!.row.row,
        field: "full_name",
        message: "El mismo correo aparece con nombres distintos.",
      });
    }
    const activity = resolveActivity(group.map((item) => item.row.activityTitle));
    if (activity === "conflict") {
      issues.push({
        row: group.find((item) => item.row.activityTitle.length > 0)?.row.row ?? group[0]!.row.row,
        field: "activity_title",
        message: "El mismo correo aparece con actividades distintas.",
      });
    }
    const documents = group.map((item) => item.document).filter((item): item is StoredDocument => item !== null);
    const distinctDocs = new Set(documents.map((item) => `${item.countryCode}|${item.docTypeCode}|${item.docNumber}`));
    if (distinctDocs.size > 1) {
      issues.push({
        row: group[1]!.row.row,
        field: "doc_number",
        message: "El mismo correo aparece con documentos distintos.",
      });
    }
    const incoming = documents[0] ?? null;
    if (documentsConflict(storedDoc(current), incoming)) {
      issues.push({
        row: group.find((item) => item.document)?.row.row ?? group[0]!.row.row,
        field: "doc_number",
        message: "El documento no coincide con el que ya tiene este correo.",
      });
    }

    const seen = new Set<string>();
    const certificates: PlannedCertificate[] = [];
    for (const item of group) {
      if (!item.certificate) {
        continue;
      }
      if (seen.has(item.certificate.roleCode) || current?.roles.includes(item.certificate.roleCode)) {
        issues.push({
          row: item.row.row,
          field: "role",
          message: "Este correo ya tiene certificado para ese rol.",
          value: item.certificate.roleCode,
        });
        continue;
      }
      seen.add(item.certificate.roleCode);
      certificates.push(item.certificate);
    }

    people.push({
      existingId: current?.id ?? null,
      email,
      fullName: group.find((item) => item.row.fullName.length > 0)?.row.fullName ?? current?.fullName ?? "",
      activityTitle: activity === "conflict" ? current?.activityTitle ?? null : activity ?? current?.activityTitle ?? null,
      venueId: group.find((item) => item.venueId)?.venueId ?? current?.venueId ?? null,
      document: incoming ?? storedDoc(current),
      certificates,
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, people };
}

function resolveRowDocument(
  row: ParticipantCsvRow,
  input: { instance: "osm_lat" | "ac3"; identityRules: ReadonlyMap<string, IdentityRule> },
  issues: ImportIssue[],
): StoredDocument | null {
  const presence = documentPresence({
    countryCode: row.countryCode,
    docTypeCode: row.docType,
    docNumber: row.docNumber,
  });
  if (presence === "partial") {
    issues.push({ row: row.row, field: "doc_number", message: "El documento necesita país, tipo y número." });
    return null;
  }
  if (presence === "absent") {
    if (input.instance === "ac3") {
      issues.push({ row: row.row, field: "doc_number", message: "En AC3 el documento es obligatorio." });
    }
    return null;
  }
  const countryCode = row.countryCode.trim().toUpperCase();
  const docTypeCode = row.docType.trim().toUpperCase();
  const normalized = normalizeDocument(
    { countryCode, docTypeCode, docNumber: row.docNumber },
    input.identityRules.get(`${countryCode}|${docTypeCode}`) ?? null,
  );
  if (!normalized.ok) {
    issues.push({ row: row.row, field: normalized.field === "docTypeCode" ? "doc_type" : "doc_number", message: normalized.message });
    return null;
  }
  return normalized.value;
}

function resolveActivity(titles: string[]): string | null | "conflict" {
  const present = [...new Set(titles.map((title) => title.trim()).filter((title) => title.length > 0))];
  if (present.length > 1) {
    return "conflict";
  }
  return present[0] ?? null;
}

function groupByEmail(drafts: Draft[]): Map<string, Draft[]> {
  const groups = new Map<string, Draft[]>();
  for (const draft of drafts) {
    const group = groups.get(draft.email) ?? [];
    group.push(draft);
    groups.set(draft.email, group);
  }
  return groups;
}

function storedDoc(existing: ExistingParticipant | null): StoredDocument | null {
  if (!existing?.countryCode || !existing.docTypeCode || !existing.docNumber) {
    return null;
  }
  return {
    countryCode: existing.countryCode.trim(),
    docTypeCode: existing.docTypeCode,
    docNumber: existing.docNumber,
  };
}
