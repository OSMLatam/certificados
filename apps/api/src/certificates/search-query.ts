import { z } from "zod";
import type { FieldDetail } from "../common/http";

const optionalText = z
  .string()
  .trim()
  .max(255)
  .optional()
  .transform((value) => (value ? value : undefined));

const searchBody = z
  .object({
    email: optionalText,
    countryCode: z.string().trim().max(2).optional().transform((value) => (value ? value : undefined)),
    docTypeCode: z.string().trim().max(10).optional().transform((value) => (value ? value : undefined)),
    docNumber: optionalText,
  })
  .strict();

export type SearchQuery =
  | { kind: "email"; email: string }
  | { kind: "document"; countryCode: string; docTypeCode: string; docNumber: string };

/** Email or a complete document. Anything else, including both, is rejected. */
export function parseSearchQuery(body: unknown): { ok: true; query: SearchQuery } | { ok: false; details: FieldDetail[] } {
  const parsed = searchBody.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.code === "unrecognized_keys" ? "La búsqueda solo acepta correo o documento." : issue.message,
      })),
    };
  }
  const email = parsed.data.email;
  const document = [parsed.data.countryCode, parsed.data.docTypeCode, parsed.data.docNumber].filter(
    (value) => value !== undefined,
  );
  if (email && document.length > 0) {
    return { ok: false, details: [{ field: "email", message: "Usa el correo o el documento, no los dos." }] };
  }
  if (!email && document.length === 0) {
    return { ok: false, details: [{ field: "email", message: "Escribe un correo o un documento." }] };
  }
  if (!email && document.length < 3) {
    return { ok: false, details: [{ field: "docNumber", message: "El documento necesita país, tipo y número." }] };
  }
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, details: [{ field: "email", message: "El correo no es válido." }] };
    }
    return { ok: true, query: { kind: "email", email } };
  }
  return {
    ok: true,
    query: {
      kind: "document",
      countryCode: parsed.data.countryCode!,
      docTypeCode: parsed.data.docTypeCode!,
      docNumber: parsed.data.docNumber!,
    },
  };
}
