import { useEffect, useState } from "react";
import { api } from "./api";
import { AdminShell } from "./AdminShell";

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
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [roles, setRoles] = useState<string[]>(["asistente"]);
  const [pregeneratedOnly, setPregeneratedOnly] = useState(false);

  function reload() {
    void api<{ items: EventRow[] }>("/api/v1/admin/events?pageSize=100").then(
      (page) => setItems(page.items),
      (reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudieron cargar los eventos."),
    );
  }

  useEffect(reload, []);

  return (
    <>
      <h1>Eventos</h1>
      {error ? <p role="alert">{error}</p> : null}
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
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          void api("/api/v1/admin/events", {
            method: "POST",
            body: JSON.stringify({
              name,
              year: Number(startDate.slice(0, 4)),
              startDate,
              countryCode: "CO",
              allowedRoles: roles,
              pregeneratedOnly,
            }),
          }).then(
            (created) => {
              window.location.assign(`/admin/events/${(created as { id: string }).id}`);
            },
            (reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo crear el evento."),
          );
        }}
      >
        <h2>Nuevo evento</h2>
        <label htmlFor="event-name">Nombre</label>
        <input id="event-name" value={name} onChange={(event) => setName(event.target.value)} required />
        <label htmlFor="event-date">Fecha de inicio</label>
        <input id="event-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
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
