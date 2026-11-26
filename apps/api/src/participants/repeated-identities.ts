export type IdentityRow = {
  eventId: string;
  eventName: string;
  participantId: string;
  fullName: string;
  email: string | null;
  countryCode: string | null;
  docTypeCode: string | null;
  docNumber: string | null;
};

export type IdentityRepeat = {
  eventId: string;
  eventName: string;
  kind: "email" | "document";
  key: string;
  people: { id: string; fullName: string }[];
};

/** People who already share an email or a document. Read-only: it does not decide a winner. */
export function repeatedIdentities(rows: readonly IdentityRow[]): IdentityRepeat[] {
  const emails = new Map<string, IdentityRepeat>();
  const documents = new Map<string, IdentityRepeat>();
  for (const row of rows) {
    if (row.email) {
      const key = `${row.eventId}\n${row.email}`;
      const group = emails.get(key) ?? {
        eventId: row.eventId,
        eventName: row.eventName,
        kind: "email" as const,
        key: row.email,
        people: [],
      };
      group.people.push({ id: row.participantId, fullName: row.fullName });
      emails.set(key, group);
    }
    if (row.countryCode && row.docTypeCode && row.docNumber) {
      const label = `${row.countryCode} ${row.docTypeCode} ${row.docNumber}`;
      const key = `${row.eventId}\n${label}`;
      const group = documents.get(key) ?? {
        eventId: row.eventId,
        eventName: row.eventName,
        kind: "document" as const,
        key: label,
        people: [],
      };
      group.people.push({ id: row.participantId, fullName: row.fullName });
      documents.set(key, group);
    }
  }
  return [...emails.values(), ...documents.values()]
    .filter((group) => group.people.length > 1)
    .sort((left, right) => left.eventName.localeCompare(right.eventName, "es") || left.kind.localeCompare(right.kind) || left.key.localeCompare(right.key));
}

export function formatIdentityRepeats(groups: readonly IdentityRepeat[]): string {
  if (groups.length === 0) {
    return "No hay correos ni documentos repetidos entre personas distintas.\n";
  }
  const lines: string[] = [];
  let eventId = "";
  for (const group of groups) {
    if (group.eventId !== eventId) {
      eventId = group.eventId;
      lines.push(`Evento: ${group.eventName} (${group.eventId})`);
    }
    const label = group.kind === "email" ? "Correo repetido" : "Documento repetido";
    lines.push(`  ${label} en ${group.people.length} personas: ${group.key}`);
    for (const person of group.people) {
      lines.push(`    - ${person.id} ${person.fullName}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
