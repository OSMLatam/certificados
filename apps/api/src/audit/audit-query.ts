import { z } from "zod";
import { validationFailed } from "../common/http";
import { AUDIT_ACTIONS, type AuditAction } from "./audit-actions";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato YYYY-MM-DD.");

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  action: z.enum(AUDIT_ACTIONS).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export type AuditQuery = {
  page: number;
  pageSize: number;
  action?: AuditAction;
  from?: string;
  to?: string;
};

export function parseAuditQuery(input: unknown): AuditQuery {
  const source = blankToUndefined(input);
  const parsed = querySchema.safeParse(source);
  if (!parsed.success) {
    throw validationFailed(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "query",
        message: issue.message,
      })),
    );
  }
  const query = parsed.data;
  if (query.from && query.to && query.from > query.to) {
    throw validationFailed([{ field: "to", message: "La fecha final es anterior a la inicial." }]);
  }
  return query;
}

function blankToUndefined(input: unknown): unknown {
  if (!input || typeof input !== "object") {
    return input;
  }
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    next[key] = value === "" ? undefined : value;
  }
  return next;
}
