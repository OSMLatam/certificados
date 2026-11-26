import type { NormalizeStrategy } from "@certificados/shared";
import type { ParticipantCsvRow } from "@certificados/shared";
import { normalizeActivityKey, parseParticipantIdentity, repeatedEmailMessage } from "@certificados/shared";
import { resolveCertificateTemplate, resolveVenueId } from "../events/event-rules";
import { documentsConflict, normalizeDocument, type StoredDocument } from "./document-rules";

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
  sourceRow: number;
  activityTitle: string | null;
  activityKey: string;
};

export type PlannedParticipant = {
  key: string;
  existingId: string | null;
  email: string | null;
  fullName: string;
  activityTitle: string | null;
  venueId: string | null;
  document: StoredDocument | null;
  certificates: PlannedCertificate[];
  completedFields: Array<"email" | "document">;
};

export type ExistingParticipant = {
  id: string;
  email: string | null;
  fullName: string;
  activityTitle: string | null;
  venueId: string | null;
  erasedAt: Date | null;
  countryCode: string | null;
  docTypeCode: string | null;
  docNumber: string | null;
  liveCertificates: { roleCode: string; activityKey: string; activityTitle: string | null }[];
};

type IdentityRule = {
  normalize: NormalizeStrategy;
  validationRegex: string | null;
};

type Draft = {
  row: ParticipantCsvRow;
  email: string | null;
  document: StoredDocument | null;
  venueId: string | null;
  certificate: PlannedCertificate | null;
  key: string;
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
    const identity = parseParticipantIdentity({
      email: row.email,
      countryCode: row.countryCode,
      docTypeCode: row.docType,
      docNumber: row.docNumber,
    });
    if (!identity.ok) {
      for (const issue of identity.issues) {
        issues.push({
          row: row.row,
          field: issue.field === "docNumber" ? "doc_number" : issue.field,
          message: issue.message,
        });
      }
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
        const activityTitle = row.activityTitle.trim();
        certificate = {
          roleCode: role,
          ...resolved,
          venueId: null,
          sourceRow: row.row,
          activityTitle: activityTitle.length > 0 ? activityTitle : null,
          activityKey: normalizeActivityKey(activityTitle),
        };
      }
    }

    let document: StoredDocument | null = null;
    let documentFailed = false;
    if (identity.ok && identity.document) {
      const normalized = normalizeDocument(
        identity.document,
        input.identityRules.get(`${identity.document.countryCode}|${identity.document.docTypeCode}`) ?? null,
      );
      if (!normalized.ok) {
        documentFailed = true;
        issues.push({
          row: row.row,
          field: normalized.field === "docTypeCode" ? "doc_type" : "doc_number",
          message: normalized.message,
        });
      } else {
        document = normalized.value;
      }
    }
    const ac3MissingDocument = identity.ok && input.instance === "ac3" && !identity.document;
    if (ac3MissingDocument) {
      issues.push({ row: row.row, field: "doc_number", message: "En AC3 el documento es obligatorio." });
    }

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
    if (identity.ok && !documentFailed && !ac3MissingDocument) {
      const key = participantKey(identity.email, document);
      if (key) {
        drafts.push({
          row,
          email: identity.email,
          document,
          venueId: "error" in venue ? null : venue.venueId,
          certificate,
          key,
        });
      }
    }
  }

  const indexed = indexExisting(input.existing);
  const people: PlannedParticipant[] = [];
  for (const group of groupDrafts(drafts)) {
    const emails = [...new Set(group.map((item) => item.email).filter((email): email is string => Boolean(email)))];
    const documents = uniqueDocuments(group.map((item) => item.document));
    const email = emails[0] ?? null;
    const incoming = documents[0] ?? null;
    if (emails.length === 1 && documents.length > 1) {
      issues.push({
        row: group[1]!.row.row,
        field: "email",
        message: repeatedEmailMessage(emails[0]!, documents.length),
      });
      continue;
    }
    if (emails.length > 1) {
      const row = group.find((item) => item.email && item.email !== emails[0])?.row.row ?? group[0]!.row.row;
      issues.push({
        row,
        field: "email",
        message: line(row, "El mismo documento aparece con correos distintos. Revisa los datos."),
      });
      continue;
    }
    const normalizedNames = new Set(group.map((item) => normalizePersonName(item.row.fullName)).filter((name) => name.length > 0));
    if (normalizedNames.size > 1) {
      issues.push({
        row: group[1]!.row.row,
        field: "full_name",
        message: email ? "El mismo correo aparece con nombres distintos." : "El mismo documento aparece con nombres distintos.",
      });
    }
    const found = matchExisting(indexed, emails, documents);
    const live = found.filter((person) => !person.erasedAt);
    if (live.length === 0 && found.some((person) => person.erasedAt)) {
      issues.push({
        row: group[0]!.row.row,
        field: email ? "email" : "doc_number",
        message: email ? "Ese correo pertenece a un participante suprimido." : "Ese documento pertenece a un participante suprimido.",
      });
      continue;
    }
    if (live.length > 1) {
      const emailOwner = live.find((person) => person.email !== null && emails.includes(person.email));
      const documentOwner = live.find((person) => {
        const document = storedDoc(person);
        return document !== null && documents.some((item) => documentKey(item) === documentKey(document));
      });
      const row = group.find((item) => item.email && item.document)?.row.row ?? group[0]!.row.row;
      const message =
        emailOwner && documentOwner && emailOwner.id !== documentOwner.id
          ? line(row, `el correo pertenece a "${emailOwner.fullName}" y el documento a "${documentOwner.fullName}". Revisa los datos.`)
          : line(
              row,
              `este correo o documento ya está en más de una persona (${live.map((person) => `"${person.fullName}"`).join(" y ")}). Revísalas a mano antes de importar.`,
            );
      issues.push({ row, field: "email", message });
      continue;
    }
    const current = live[0] ?? null;
    const activityTitle = current ? current.activityTitle : sharedActivity(group.map((item) => item.row.activityTitle));
    if (current) {
      const storedName = normalizePersonName(current.fullName);
      const mismatch = group.find((item) => {
        const incomingName = normalizePersonName(item.row.fullName);
        return incomingName.length > 0 && incomingName !== storedName;
      });
      if (mismatch) {
        const row = mismatch.row.row;
        issues.push({
          row,
          field: "full_name",
          message: line(
            row,
            `ya existe una persona con este documento (o correo) llamada "${current.fullName}"; aquí viene como "${mismatch.row.fullName.trim()}". Corrige el nombre para que coincida, o corrige primero a la persona existente.`,
          ),
        });
      }
    }
    const stored = storedDoc(current);
    if (documentsConflict(stored, incoming)) {
      issues.push({
        row: group.find((item) => item.document)?.row.row ?? group[0]!.row.row,
        field: "doc_number",
        message: "El documento no coincide con el que ya tiene este correo.",
      });
    }
    if (current?.email && email && current.email !== email) {
      const row = group.find((item) => item.email)?.row.row ?? group[0]!.row.row;
      issues.push({
        row,
        field: "email",
        message: "El correo no coincide con el que ya tiene este documento.",
      });
    }

    const seen = new Set<string>();
    const certificates: PlannedCertificate[] = [];
    for (const item of group) {
      const certificate = item.certificate;
      if (!certificate) {
        continue;
      }
      const slot = `${certificate.roleCode}\n${certificate.activityKey}`;
      const storedMatch = current?.liveCertificates.find(
        (existing) => existing.roleCode === certificate.roleCode && existing.activityKey === certificate.activityKey,
      );
      const earlier = certificates.find(
        (existing) => existing.roleCode === certificate.roleCode && existing.activityKey === certificate.activityKey,
      );
      if (seen.has(slot) || storedMatch || earlier) {
        const quoted = storedMatch?.activityTitle || earlier?.activityTitle || certificate.activityTitle || "";
        issues.push({
          row: item.row.row,
          field: "role",
          message: duplicateRoleMessage(item.row.row, certificate.roleCode, quoted, Boolean(email)),
          value: certificate.roleCode,
        });
        continue;
      }
      seen.add(slot);
      certificates.push(certificate);
    }

    const completedFields: Array<"email" | "document"> = [];
    if (current && !current.email && email) {
      completedFields.push("email");
    }
    if (current && !stored && incoming) {
      completedFields.push("document");
    }
    people.push({
      key: current ? `id:${current.id}` : participantKey(email, incoming) ?? `row:${group[0]!.row.row}`,
      existingId: current?.id ?? null,
      email: current?.email ?? email,
      fullName: current?.fullName ?? group.find((item) => item.row.fullName.trim().length > 0)?.row.fullName.trim() ?? "",
      activityTitle,
      venueId: group.find((item) => item.venueId)?.venueId ?? current?.venueId ?? null,
      document: stored ?? incoming,
      certificates,
      completedFields,
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, people };
}

export function participantKey(email: string | null, document: StoredDocument | null): string | null {
  if (email) {
    return `email:${email}`;
  }
  if (document) {
    return `doc:${documentKey(document)}`;
  }
  return null;
}

function documentKey(document: StoredDocument): string {
  return `${document.countryCode}|${document.docTypeCode}|${document.docNumber}`;
}

function sharedActivity(titles: string[]): string | null {
  const present = titles.map((title) => title.trim()).filter((title) => title.length > 0);
  const keys = new Set(present.map((title) => normalizeActivityKey(title)));
  if (keys.size !== 1) {
    return null;
  }
  return present[0] ?? null;
}

function duplicateRoleMessage(row: number, role: string, activityTitle: string, byEmail: boolean): string {
  if (activityTitle.length === 0) {
    return byEmail ? "Este correo ya tiene certificado para ese rol." : "Este documento ya tiene certificado para ese rol.";
  }
  return line(row, `esta persona ya tiene un certificado de ${role} para "${activityTitle}".`);
}

/** Compare names without accents, case, or repeated spaces. The stored spelling stays as written. */
export function normalizePersonName(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function line(row: number, sentence: string): string {
  if (row > 0) {
    return `Fila ${row}: ${sentence}`;
  }
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function groupDrafts(drafts: Draft[]): Draft[][] {
  const parent = drafts.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) {
      parent[index] = find(parent[index]!);
    }
    return parent[index]!;
  };
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) {
      parent[b] = a;
    }
  };
  const emailFirst = new Map<string, number>();
  const docFirst = new Map<string, number>();
  drafts.forEach((draft, index) => {
    if (draft.email) {
      const previous = emailFirst.get(draft.email);
      if (previous === undefined) {
        emailFirst.set(draft.email, index);
      } else {
        union(previous, index);
      }
    }
    if (draft.document) {
      const key = documentKey(draft.document);
      const previous = docFirst.get(key);
      if (previous === undefined) {
        docFirst.set(key, index);
      } else {
        union(previous, index);
      }
    }
  });
  const groups = new Map<number, Draft[]>();
  drafts.forEach((draft, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(draft);
    groups.set(root, group);
  });
  return [...groups.values()];
}

function indexExisting(people: readonly ExistingParticipant[]) {
  const byEmail = new Map<string, ExistingParticipant[]>();
  const byDoc = new Map<string, ExistingParticipant[]>();
  for (const person of people) {
    if (person.email) {
      const list = byEmail.get(person.email) ?? [];
      list.push(person);
      byEmail.set(person.email, list);
    }
    const document = storedDoc(person);
    if (document) {
      const key = documentKey(document);
      const list = byDoc.get(key) ?? [];
      list.push(person);
      byDoc.set(key, list);
    }
  }
  return { byEmail, byDoc };
}

function matchExisting(
  indexed: ReturnType<typeof indexExisting>,
  emails: readonly string[],
  documents: readonly StoredDocument[],
): ExistingParticipant[] {
  const found = new Map<string, ExistingParticipant>();
  for (const email of emails) {
    for (const person of indexed.byEmail.get(email) ?? []) {
      found.set(person.id, person);
    }
  }
  for (const document of documents) {
    for (const person of indexed.byDoc.get(documentKey(document)) ?? []) {
      found.set(person.id, person);
    }
  }
  return [...found.values()];
}

function uniqueDocuments(documents: Array<StoredDocument | null>): StoredDocument[] {
  const seen = new Map<string, StoredDocument>();
  for (const document of documents) {
    if (document) {
      seen.set(documentKey(document), document);
    }
  }
  return [...seen.values()];
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
