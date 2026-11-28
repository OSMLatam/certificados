export const LEGAL_ROW_ID = "00000000-0000-4000-8000-000000000001";
export const LEGAL_SIGNER_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const DEFAULT_DISCLAIMER =
  "Este documento certifica la participación en la actividad indicada. No constituye título profesional, grado académico ni habilitación legal.";

export type LegalSigner = {
  slot: number;
  name: string;
  title: string;
  signature_storage_key: string | null;
};

export type LegalSnapshot = {
  entity_name: string;
  nit: string;
  representative: string;
  issue_city: string;
  issued_at: string;
  disclaimer: string;
  folio: number;
  signers: LegalSigner[];
};

export type LegalSource = {
  entityName: string;
  nit: string;
  representative: string;
  issueCity: string;
  disclaimer: string;
  signers: LegalSigner[];
};

/** First transition reserves last_folio+1. A retry or a failed render reuses the folio already stored. */
export function nextFolio(currentFolio: number | null, lastFolio: number): { folio: number; lastFolio: number } {
  if (currentFolio !== null) {
    return { folio: currentFolio, lastFolio };
  }
  const folio = lastFolio + 1;
  return { folio, lastFolio: folio };
}

export function issueDateLabel(issuedAt: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(issuedAt);
}

export function buildLegalSnapshot(source: LegalSource, folio: number, issuedAt: Date): LegalSnapshot {
  return {
    entity_name: source.entityName,
    nit: source.nit,
    representative: source.representative,
    issue_city: source.issueCity,
    issued_at: issuedAt.toISOString(),
    disclaimer: source.disclaimer,
    folio,
    signers: source.signers
      .filter((signer) => signer.slot >= 1 && signer.slot <= 8)
      .map((signer) => ({
        slot: signer.slot,
        name: signer.name,
        title: signer.title,
        signature_storage_key: signer.signature_storage_key,
      }))
      .sort((left, right) => left.slot - right.slot),
  };
}

export function legalTextValues(snapshot: LegalSnapshot, preview: boolean): Record<string, string> {
  const values: Record<string, string> = {
    "legal.entity_name": snapshot.entity_name,
    "legal.nit": snapshot.nit,
    "legal.representative": snapshot.representative,
    "legal.issue_city": snapshot.issue_city,
    "legal.disclaimer": snapshot.disclaimer,
    "legal.folio": preview ? "—" : String(snapshot.folio),
    "legal.issue_date": preview ? "—" : issueDateLabel(new Date(snapshot.issued_at)),
  };
  for (const slot of LEGAL_SIGNER_SLOTS) {
    const signer = snapshot.signers.find((item) => item.slot === slot);
    values[`legal.signer.${slot}.name`] = signer?.name ?? "";
    values[`legal.signer.${slot}.title`] = signer?.title ?? "";
    values[`legal.signer.${slot}.signature`] = "";
  }
  return values;
}

/** Keys a PATCH may change. last_folio is never one of them. */
export function changedLegalKeys(
  before: { entityName: string; nit: string; representative: string; issueCity: string; disclaimer: string },
  after: { entityName: string; nit: string; representative: string; issueCity: string; disclaimer: string },
): string[] {
  const keys: string[] = [];
  if (before.entityName !== after.entityName) keys.push("entity_name");
  if (before.nit !== after.nit) keys.push("nit");
  if (before.representative !== after.representative) keys.push("representative");
  if (before.issueCity !== after.issueCity) keys.push("issue_city");
  if (before.disclaimer !== after.disclaimer) keys.push("disclaimer");
  return keys;
}
