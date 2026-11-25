import { normalizeDocNumber, type NormalizeStrategy } from "@certificados/shared";

export type DocumentInput = {
  countryCode?: string;
  docTypeCode?: string;
  docNumber?: string;
};

export type StoredDocument = {
  countryCode: string;
  docTypeCode: string;
  docNumber: string;
};

type IdentityRule = {
  normalize: NormalizeStrategy;
  validationRegex: string | null;
};

export function documentPresence(input: DocumentInput): "absent" | "complete" | "partial" {
  const present = [input.countryCode, input.docTypeCode, input.docNumber].filter(
    (value) => value !== undefined && value.trim() !== "",
  );
  if (present.length === 0) {
    return "absent";
  }
  if (present.length === 3) {
    return "complete";
  }
  return "partial";
}

export function normalizeDocument(
  input: Required<DocumentInput>,
  rule: IdentityRule | null,
): { ok: true; value: StoredDocument } | { ok: false; field: string; message: string } {
  if (!rule) {
    return {
      ok: false,
      field: "docTypeCode",
      message: "Ese tipo de documento no existe para el país indicado.",
    };
  }
  const countryCode = input.countryCode.trim().toUpperCase();
  const docTypeCode = input.docTypeCode.trim().toUpperCase();
  const docNumber = normalizeDocNumber(input.docNumber, rule.normalize);
  if (docNumber.length === 0) {
    return { ok: false, field: "docNumber", message: "El número de documento quedó vacío." };
  }
  if (rule.validationRegex && !new RegExp(rule.validationRegex).test(docNumber)) {
    return {
      ok: false,
      field: "docNumber",
      message: `El número no cumple el formato de ${docTypeCode}.`,
    };
  }
  return { ok: true, value: { countryCode, docTypeCode, docNumber } };
}

export function documentsConflict(stored: StoredDocument | null, incoming: StoredDocument | null): boolean {
  if (!stored || !incoming) {
    return false;
  }
  return (
    stored.countryCode !== incoming.countryCode ||
    stored.docTypeCode !== incoming.docTypeCode ||
    stored.docNumber !== incoming.docNumber
  );
}
