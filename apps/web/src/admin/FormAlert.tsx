import { ApiError, formatDetail } from "./form-feedback";

export function FormAlert({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }
  if (error instanceof ApiError && error.details.length > 0) {
    return (
      <div role="alert">
        <p>{error.message}</p>
        <ul>
          {error.details.map((detail, index) => (
            <li key={`${detail.row ?? 0}-${detail.field ?? "field"}-${index}`}>{formatDetail(detail)}</li>
          ))}
        </ul>
      </div>
    );
  }
  const message = error instanceof Error ? error.message : "No se pudo completar.";
  return <p role="alert">{message}</p>;
}

export function FormSuccess({ message }: { message: string }) {
  return message ? <p role="status">{message}</p> : null;
}
