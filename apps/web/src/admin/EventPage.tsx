import { useEffect, useState } from "react";
import { api } from "./api";
import { AdminShell } from "./AdminShell";

type EventDetail = {
  id: string;
  name: string;
  status: string;
  countryCode: string;
  startDate: string;
  allowedRoles: string[];
  pregeneratedOnly: boolean;
  defaultTemplateId: string | null;
  venueCount: number;
  participantCount: number;
};

type Certificate = {
  id: string;
  roleCode: string;
  status: string;
  slug: string;
  mode: string;
  issueAttempts: number;
};

type Participant = {
  id: string;
  fullName: string;
  email: string;
  certificates: Certificate[];
};

const STATUS: Record<string, string> = { pending: "Aún no generado", issued: "Válido", failed: "No generado", revoked: "Revocado" };
const DOC_TYPES = ["CC", "CE", "TI"];

export function EventPage({ eventId }: { eventId: string }) {
  return (
    <AdminShell title="Evento">
      {() => <EventBody eventId={eventId} />}
    </AdminShell>
  );
}

function EventBody({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [people, setPeople] = useState<Participant[]>([]);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [activityTitle, setActivityTitle] = useState("");
  const [docType, setDocType] = useState("CC");
  const [docNumber, setDocNumber] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueCode, setVenueCode] = useState("");

  function reload() {
    void api<EventDetail>(`/api/v1/admin/events/${eventId}`).then(setEvent, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "No se pudo abrir el evento.");
    });
    void api<{ items: Participant[] }>(`/api/v1/admin/events/${eventId}/participants?pageSize=100`).then(
      (page) => setPeople(page.items),
      () => undefined,
    );
  }

  useEffect(reload, [eventId]);

  function fail(reason: unknown, fallback: string) {
    setError(reason instanceof Error ? reason.message : fallback);
  }

  function changeStatus(status: "draft" | "active") {
    setError("");
    void api(`/api/v1/admin/events/${eventId}`, { method: "PATCH", body: JSON.stringify({ status }) }).then(
      () => reload(),
      (reason: unknown) => fail(reason, "No se pudo cambiar el estado."),
    );
  }

  function withdraw() {
    if (!window.confirm("El evento deja de listarse. Los enlaces públicos siguen abriendo.")) {
      return;
    }
    setError("");
    void api(`/api/v1/admin/events/${eventId}`, { method: "DELETE" }).then(
      () => window.location.assign("/admin/events"),
      (reason: unknown) => fail(reason, "No se pudo retirar el evento."),
    );
  }

  return (
    <>
      <h1>{event?.name ?? "Evento"}</h1>
      {error ? <p role="alert">{error}</p> : null}
      {event ? (
        <>
          <p>
            {event.status === "active" ? "Activo" : "Borrador"}
            {event.pregeneratedOnly ? " · Solo archivos ya generados" : ""} · {event.startDate} · {event.venueCount} sedes · {event.participantCount} participantes ·{" "}
            <a href={`/admin/events/${eventId}/template`}>Editar plantilla</a>
          </p>
          <div className="actions">
            {event.status === "draft" ? (
              <button type="button" className="primary" onClick={() => changeStatus("active")}>
                Activar evento
              </button>
            ) : (
              <button type="button" onClick={() => changeStatus("draft")}>
                Volver a borrador
              </button>
            )}
            <button type="button" onClick={withdraw}>
              Retirar evento
            </button>
          </div>
          {event.status === "draft" && !event.pregeneratedOnly && !event.defaultTemplateId ? (
            <p>Para activarlo hace falta una plantilla predeterminada.</p>
          ) : null}
        </>
      ) : null}
      <h2>Participantes</h2>
      <p>Aún no generado: el certificado se crea la primera vez que alguien abre su enlace. Copia ese enlace; el correo automático llega en una fase posterior.</p>
      <ul>
        {people.map((person) => (
          <li key={person.id}>
            {person.fullName} · {person.email}
            <ul>
              {person.certificates.map((certificate) => (
                <li key={certificate.id}>
                  {certificate.roleCode}: {STATUS[certificate.status] ?? certificate.status}
                  {certificate.issueAttempts > 0 ? ` · ${certificate.issueAttempts} intentos` : ""} ·{" "}
                  <a href={`/c/${certificate.slug}`}>/c/{certificate.slug}</a>
                  {certificate.status === "failed" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        void api(`/api/v1/admin/certificates/${certificate.id}/retry-issue`, { method: "POST" }).then(
                          () => reload(),
                          (reason: unknown) => fail(reason, "No se pudo reintentar."),
                        );
                      }}
                    >
                      Reintentar generación
                    </button>
                  ) : null}
                  {certificate.mode === "pregenerated" && certificate.status === "pending" ? (
                    <form
                      className="stack"
                      onSubmit={(submit) => {
                        submit.preventDefault();
                        const input = submit.currentTarget.elements.namedItem("file");
                        const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
                        if (!file) {
                          setError("Elige el archivo del certificado.");
                          return;
                        }
                        const body = new FormData();
                        body.set("file", file);
                        setError("");
                        void api(`/api/v1/admin/certificates/${certificate.id}/pregenerated`, { method: "POST", body }).then(
                          () => reload(),
                          (reason: unknown) => fail(reason, "No se pudo subir el archivo."),
                        );
                      }}
                    >
                      <label htmlFor={`file-${certificate.id}`}>Archivo ya generado</label>
                      <input id={`file-${certificate.id}`} name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" />
                      <button type="submit">Subir archivo</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <form
        className="stack"
        onSubmit={(submit) => {
          submit.preventDefault();
          setError("");
          const body: Record<string, unknown> = { fullName, email, roles };
          if (activityTitle.trim()) {
            body.activityTitle = activityTitle.trim();
          }
          if (docNumber.trim()) {
            body.countryCode = event?.countryCode || "CO";
            body.docTypeCode = docType;
            body.docNumber = docNumber.trim();
          }
          void api(`/api/v1/admin/events/${eventId}/participants`, {
            method: "POST",
            body: JSON.stringify(body),
          }).then(
            () => {
              setFullName("");
              setEmail("");
              setActivityTitle("");
              setDocNumber("");
              reload();
            },
            (reason: unknown) => fail(reason, "No se pudo dar de alta."),
          );
        }}
      >
        <h2>Alta individual</h2>
        <label htmlFor="person-name">Nombre</label>
        <input id="person-name" value={fullName} onChange={(input) => setFullName(input.target.value)} required />
        <label htmlFor="person-email">Correo</label>
        <input id="person-email" type="email" value={email} onChange={(input) => setEmail(input.target.value)} required />
        <label htmlFor="activity-title">Actividad o charla</label>
        <input id="activity-title" value={activityTitle} onChange={(input) => setActivityTitle(input.target.value)} />
        <fieldset>
          <legend>Documento (opcional)</legend>
          <label htmlFor="doc-type">Tipo</label>
          <select id="doc-type" value={docType} onChange={(input) => setDocType(input.target.value)}>
            {DOC_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <label htmlFor="doc-number">Número</label>
          <input id="doc-number" value={docNumber} onChange={(input) => setDocNumber(input.target.value)} />
        </fieldset>
        <fieldset>
          <legend>Roles</legend>
          {(event?.allowedRoles ?? []).map((role) => (
            <label key={role}>
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={(input) => setRoles(input.target.checked ? [...roles, role] : roles.filter((item) => item !== role))}
              />
              {role}
            </label>
          ))}
        </fieldset>
        <button className="primary" type="submit">
          Agregar participante
        </button>
      </form>
      <form
        className="stack"
        onSubmit={(submit) => {
          submit.preventDefault();
          const input = submit.currentTarget.elements.namedItem("csv");
          const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
          if (!file) {
            setError("Elige un archivo CSV.");
            return;
          }
          const body = new FormData();
          body.set("file", file);
          setError("");
          void api(`/api/v1/admin/events/${eventId}/participants/import`, { method: "POST", body }).then(
            () => reload(),
            (reason: unknown) => fail(reason, "No se pudo importar el CSV."),
          );
        }}
      >
        <h2>Importar CSV</h2>
        <p>
          <a href={`/api/v1/admin/events/${eventId}/participants/import/template`}>Descargar la plantilla</a>
        </p>
        <label htmlFor="csv-file">Archivo CSV</label>
        <input id="csv-file" name="csv" type="file" accept=".csv,text/csv" />
        <button type="submit">Importar participantes</button>
      </form>
      <form
        className="stack"
        onSubmit={(submit) => {
          submit.preventDefault();
          const csvInput = submit.currentTarget.elements.namedItem("csv");
          const zipInput = submit.currentTarget.elements.namedItem("zip");
          const csv = csvInput instanceof HTMLInputElement ? csvInput.files?.[0] : undefined;
          const zip = zipInput instanceof HTMLInputElement ? zipInput.files?.[0] : undefined;
          if (!csv || !zip) {
            setError("Elige la hoja CSV y el ZIP.");
            return;
          }
          const body = new FormData();
          body.set("csv", csv);
          body.set("zip", zip);
          setError("");
          void api(`/api/v1/admin/events/${eventId}/pregenerated/import`, { method: "POST", body }).then(
            () => reload(),
            (reason: unknown) => fail(reason, "No se pudo importar el lote."),
          );
        }}
      >
        <h2>Certificados ya generados</h2>
        <p>
          <a href={`/api/v1/admin/events/${eventId}/pregenerated/import/template`}>Descargar la plantilla</a>
        </p>
        <label htmlFor="pre-csv">Hoja CSV</label>
        <input id="pre-csv" name="csv" type="file" accept=".csv,text/csv" />
        <label htmlFor="pre-zip">ZIP de archivos</label>
        <input id="pre-zip" name="zip" type="file" accept=".zip,application/zip" />
        <button type="submit">Importar lote</button>
      </form>
      <form
        className="stack"
        onSubmit={(submit) => {
          submit.preventDefault();
          setError("");
          void api(`/api/v1/admin/events/${eventId}/venues`, {
            method: "POST",
            body: JSON.stringify({ name: venueName, code: venueCode }),
          }).then(
            () => {
              setVenueName("");
              setVenueCode("");
              reload();
            },
            (reason: unknown) => fail(reason, "No se pudo crear la sede."),
          );
        }}
      >
        <h2>Sede</h2>
        <label htmlFor="venue-name">Nombre</label>
        <input id="venue-name" value={venueName} onChange={(input) => setVenueName(input.target.value)} required />
        <label htmlFor="venue-code">Código</label>
        <input id="venue-code" value={venueCode} onChange={(input) => setVenueCode(input.target.value)} required />
        <button type="submit">Agregar sede</button>
      </form>
    </>
  );
}
