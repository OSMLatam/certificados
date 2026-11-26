export type ApiDetail = {
  field?: string;
  message: string;
  row?: number;
  value?: string;
};

export class ApiError extends Error {
  readonly details: ApiDetail[];

  constructor(message: string, details: ApiDetail[]) {
    super(message);
    this.name = "ApiError";
    this.details = details;
  }
}

export function failureFromBody(body: unknown, status: number): ApiError {
  const record = body && typeof body === "object" ? (body as { message?: unknown; details?: unknown }) : {};
  const details = Array.isArray(record.details) ? record.details.flatMap(readDetail) : [];
  const lines = details.map(formatDetail);
  const serverMessage = typeof record.message === "string" ? record.message : "";
  const generic = serverMessage === "" || serverMessage === "Validation failed" || serverMessage === "Bad Request" || serverMessage === "Unauthorized";
  const message =
    lines.length > 1
      ? "No se guardó ningún cambio."
      : lines.length === 1
        ? lines[0]!
        : generic
          ? status === 401
            ? "Inicia sesión con tu cuenta de OpenStreetMap para entrar al panel"
            : status === 403
              ? "Tu sesión no tiene acceso."
              : "No se pudo completar."
          : serverMessage;
  return new ApiError(message, details);
}

export function formatDetail(detail: ApiDetail): string {
  if (detail.row && detail.row > 0 && detail.message.startsWith(`Fila ${detail.row}:`)) {
    return detail.message;
  }
  const place = detail.row && detail.row > 0 ? `Fila ${detail.row}` : "";
  const field = detail.field && detail.field !== "file" && detail.field !== "body" ? detail.field : "";
  const head = [place, field].filter((part) => part.length > 0).join(", ");
  const value = detail.value ? ` (${detail.value})` : "";
  return head ? `${head}: ${detail.message}${value}` : `${detail.message}${value}`;
}

export function invalidFormMessage(form: HTMLFormElement): string | null {
  const field = form.querySelector(":invalid");
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) {
    return null;
  }
  if (field.validity.valueMissing) {
    return "Completa los campos obligatorios.";
  }
  if (field.validity.typeMismatch && field.type === "email") {
    return "Escribe un correo válido.";
  }
  return field.validationMessage || "Revisa los campos del formulario.";
}

function readDetail(value: unknown): ApiDetail[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const detail = value as { field?: unknown; message?: unknown; row?: unknown; value?: unknown };
  if (typeof detail.message !== "string" || detail.message.length === 0) {
    return [];
  }
  return [
    {
      field: typeof detail.field === "string" ? detail.field : undefined,
      message: detail.message,
      row: typeof detail.row === "number" ? detail.row : undefined,
      value: typeof detail.value === "string" ? detail.value : undefined,
    },
  ];
}
