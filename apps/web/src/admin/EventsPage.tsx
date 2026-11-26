import { useEffect, useState } from "react";
import { api } from "./api";
import { AdminShell } from "./AdminShell";
import { FormAlert } from "./FormAlert";
import { ApiError, type ApiDetail } from "./form-feedback";

const ROLES = ["asistente", "ponente", "tallerista", "voluntario", "organizador"];

type EventRow = {
  id: string;
  name: string;
  year: number;
  startDate: string;
  status: string;
  participantCount: number;
};

export function EventsPage() {
  return (
    <AdminShell title="Eventos">
      {() => <EventsBody />}
    </AdminShell>
  );
}

function EventsBody() {
  const [items, setItems] = useState<EventRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [roles, setRoles] = useState<string[]>(["asistente"]);
  const [pregeneratedOnly, setPregeneratedOnly] = useState(false);

  function reload() {
    void api<{ items: EventRow[] }>("/api/v1/admin/events?pageSize=100").then(
      (page) => setItems(page.items),
      (reason: unknown) => setError(reason),
    );
  }

  useEffect(reload, []);

  return (
    <>
      <h1>Eventos</h1>
      <FormAlert error={errorAside(error, ["name", "startDate"])} />
      <ul>
        {items.map((event) => (
          <li key={event.id}>
            <a href={`/admin/events/${event.id}`}>
              {event.name} ({event.year})
            </a>
            <div>
              {event.status === "active" ? "Activo" : "Borrador"} · {event.startDate} · {event.participantCount} participantes
            </div>
          </li>
        ))}
      </ul>
      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          const payload: Record<string, unknown> = { name, startDate, countryCode: "CO", allowedRoles: roles, pregeneratedOnly };
          if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
            payload.year = Number(startDate.slice(0, 4));
          }
          void api("/api/v1/admin/events", {
            method: "POST",
            body: JSON.stringify(payload),
          }).then(
            (created) => {
              window.location.assign(`/admin/events/${(created as { id: string }).id}`);
            },
            (reason: unknown) => setError(reason),
          );
        }}
      >
        <h2>Nuevo evento</h2>
        <label htmlFor="event-name">Nombre</label>
        <input
          id="event-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={fieldMessage(error, "name") ? true : undefined}
          aria-describedby={fieldMessage(error, "name") ? "event-name-error" : undefined}
        />
        {fieldMessage(error, "name") ? (
          <p id="event-name-error" className="field-error" role="alert">
            {fieldMessage(error, "name")}
          </p>
        ) : null}
        <label htmlFor="event-date">Fecha de inicio</label>
        <input
          id="event-date"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          aria-invalid={fieldMessage(error, "startDate") ? true : undefined}
          aria-describedby={fieldMessage(error, "startDate") ? "event-date-error" : undefined}
        />
        {fieldMessage(error, "startDate") ? (
          <p id="event-date-error" className="field-error" role="alert">
            {fieldMessage(error, "startDate")}
          </p>
        ) : null}
        <fieldset>
          <legend>Roles admitidos</legend>
          {ROLES.map((role) => (
            <label key={role}>
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={(event) => {
                  setRoles(event.target.checked ? [...roles, role] : roles.filter((item) => item !== role));
                }}
              />
              {role}
            </label>
          ))}
        </fieldset>
        <label>
          <input type="checkbox" checked={pregeneratedOnly} onChange={(event) => setPregeneratedOnly(event.target.checked)} />
          Solo certificados ya generados
        </label>
        <button className="primary" type="submit">
          Crear evento
        </button>
      </form>
    </>
  );
}

function fieldMessage(error: unknown, field: string): string | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  return error.details.find((detail) => detail.field === field)?.message ?? null;
}

function errorAside(error: unknown, fields: string[]): unknown {
  if (!(error instanceof ApiError)) {
    return error;
  }
  const details = error.details.filter((detail) => !fields.includes(detail.field ?? ""));
  if (details.length === error.details.length) {
    return error;
  }
  if (details.length === 0) {
    return null;
  }
  return new ApiError(details.length === 1 ? formatAside(details[0]!) : "No se guardó ningún cambio.", details);
}

function formatAside(detail: ApiDetail): string {
  return detail.field ? `${detail.field}: ${detail.message}` : detail.message;
}
