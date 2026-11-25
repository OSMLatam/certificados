import { normalizeEmail } from "./normalize";

export const MISSING_PARTICIPANT_IDENTITY = "Falta el correo o el documento: se necesita al menos uno";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type IdentityDocument = {
  countryCode: string;
  docTypeCode: string;
  docNumber: string;
};

export type ParticipantIdentityInput = {
  email?: string | null;
  countryCode?: string | null;
  docTypeCode?: string | null;
  docNumber?: string | null;
};

export type IdentityIssue = {
  field: "email" | "docNumber";
  message: string;
};

export type ParticipantIdentity =
  | { ok: true; email: string | null; document: IdentityDocument | null }
  | { ok: false; issues: IdentityIssue[] };

/** A participant is an email, a complete document, or both. A blank email is absent. */
export function parseParticipantIdentity(input: ParticipantIdentityInput): ParticipantIdentity {
  const issues: IdentityIssue[] = [];
  const rawEmail = (input.email ?? "").trim();
  let email: string | null = null;
  if (rawEmail.length > 0) {
    const normalized = normalizeEmail(rawEmail);
    if (!EMAIL_PATTERN.test(normalized) || normalized.length > 255) {
      issues.push({ field: "email", message: "El correo no es válido." });
    } else {
      email = normalized;
    }
  }

  const countryCode = (input.countryCode ?? "").trim();
  const docTypeCode = (input.docTypeCode ?? "").trim();
  const docNumber = (input.docNumber ?? "").trim();
  const filled = [countryCode, docTypeCode, docNumber].filter((part) => part.length > 0);
  let document: IdentityDocument | null = null;
  if (filled.length === 3) {
    document = {
      countryCode: countryCode.toUpperCase(),
      docTypeCode: docTypeCode.toUpperCase(),
      docNumber,
    };
  } else if (filled.length > 0) {
    issues.push({ field: "docNumber", message: "El documento necesita país, tipo y número." });
  }

  if (email === null && document === null && issues.length === 0) {
    issues.push({ field: "email", message: MISSING_PARTICIPANT_IDENTITY });
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, email, document };
}

export function repeatedEmailMessage(email: string, people: number): string {
  return `El correo ${email} aparece en ${people} personas distintas; quien lo busque verá todos sus certificados`;
}
