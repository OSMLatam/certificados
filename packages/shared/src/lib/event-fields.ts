export const EVENT_NAME_MESSAGE = "Escribe el nombre del evento";
export const EVENT_START_MESSAGE = "Escribe la fecha de inicio";

export type EventFieldIssue = { field: "name" | "startDate"; message: string };

export function parseEventFields(input: {
  name?: string | null;
  startDate?: string | null;
}): { ok: true; name: string; startDate: string } | { ok: false; issues: EventFieldIssue[] } {
  const issues: EventFieldIssue[] = [];
  const name = (input.name ?? "").trim();
  const startDate = (input.startDate ?? "").trim();
  if (name.length === 0) {
    issues.push({ field: "name", message: EVENT_NAME_MESSAGE });
  } else if (name.length > 255) {
    issues.push({ field: "name", message: "El nombre admite hasta 255 caracteres." });
  }
  if (startDate.length === 0) {
    issues.push({ field: "startDate", message: EVENT_START_MESSAGE });
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    issues.push({ field: "startDate", message: "Usa el formato YYYY-MM-DD." });
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, name, startDate };
}
