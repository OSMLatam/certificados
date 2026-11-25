import { useEffect, useState } from "react";
import { api } from "./api";
import { AdminShell } from "./AdminShell";
import { FormAlert, FormSuccess } from "./FormAlert";
import { RevokeDialog } from "./RevokeDialog";
import { invalidFormMessage } from "./form-feedback";

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

type Venue = {
  id: string;
  name: string;
  code: string;
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
  const [venues, setVenues] = useState<Venue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [activityTitle, setActivityTitle] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [docType, setDocType] = useState("CC");
  const [docNumber, setDocNumber] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueCode, setVenueCode] = useState("");
  const [revokeId, setRevokeId] = useState<string | null>(null);

  function reload() {
    void api<EventDetail>(`/api/v1/admin/events/${eventId}`).then(setEvent, (reason: unknown) => {
      setError(reason);
    });
    void api<{ items: Participant[] }>(`/api/v1/admin/events/${eventId}/participants?pageSize=100`).then(
      (page) => setPeople(page.items),
      () => undefined,
    );
    void api<{ items: Venue[] }>(`/api/v1/admin/events/${eventId}/venues`).then(
      (page) => setVenues(page.items),
      () => undefined,
    );
  }

  useEffect(reload, [eventId]);

  function fail(reason: unknown) {
    setSuccess("");
    setError(reason);
  }

  function changeStatus(status: "draft" | "active") {
    setError(null);
    setSuccess("");
    void api(`/api/v1/admin/events/${eventId}`, { method: "PATCH", body: JSON.stringify({ status }) }).then(
      () => reload(),
      (reason: unknown) => fail(reason),
    );
  }

  function withdraw() {
    if (!window.confirm("El evento deja de listarse. Los enlaces públicos siguen abriendo.")) {
      return;
    }
    setError(null);
    setSuccess("");
    void api(`/api/v1/admin/events/${eventId}`, { method: "DELETE" }).then(
      () => window.location.assign("/admin/events"),
      (reason: unknown) => fail(reason),
    );
  }

  return (
    <>
      <h1>{event?.name ?? "Evento"}</h1>
      <FormAlert error={error} />
      <FormSuccess message={success} />
      {event ? (
        <>
          <p>
            {event.status === "active" ? "Activo" : "Borrador"}
            {event.pregeneratedOnly ? " · Solo archivos ya generados" : ""} · {event.startDate} · {event.venueCount} sedes · {event.participantCount} participantes ·{" "}
            <a href={`/admin/events/${eventId}/template`}>Editar plantillas</a>
          </p>
          <div className="actions">
            {event.status === "draft" ? (
              <button type="button" className="primary" onClick={() => changeStatus("active")}>
                Publicar
              </button>
            ) : (
              <button type="button" onClick={() => changeStatus("draft")}>
                Pasar a borrador
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
                  {certificate.status !== "revoked" ? (
                    <button type="button" onClick={() => setRevokeId(certificate.id)}>
                      Revocar
                    </button>
                  ) : null}
                  {certificate.status === "failed" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setSuccess("");
                        void api(`/api/v1/admin/certificates/${certificate.id}/retry-issue`, { method: "POST" }).then(
                          () => {
                            setSuccess("El certificado volvió a quedar pendiente.");
                            reload();
                          },
                          (reason: unknown) => fail(reason),
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
                          setError(new Error("Elige el archivo del certificado."));
                          return;
                        }
                        const body = new FormData();
                        body.set("file", file);
                        setError(null);
                        setSuccess("");
                        void api(`/api/v1/admin/certificates/${certificate.id}/pregenerated`, { method: "POST", body }).then(
                          () => {
                            setSuccess("Archivo guardado.");
                            reload();
                          },
                          (reason: unknown) => fail(reason),
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
        noValidate
        onSubmit={(submit) => {
          submit.preventDefault();
          const invalid = invalidFormMessage(submit.currentTarget);
          if (invalid) {
            setSuccess("");
            setError(new Error(invalid));
            return;
          }
          if (roles.length === 0) {
            setSuccess("");
            setError(new Error("Elige al menos un rol."));
            return;
          }
          setError(null);
          setSuccess("");
          const body: Record<string, unknown> = { fullName, email, roles };
          if (activityTitle.trim()) {
            body.activityTitle = activityTitle.trim();
          }
          if (docNumber.trim()) {
            body.countryCode = (countryCode || event?.countryCode || "CO").trim().toUpperCase();
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
              setSuccess("Participante agregado.");
              reload();
            },
            (reason: unknown) => fail(reason),
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
          <legend>Documento</legend>
          <p>País, tipo y número permiten buscar el certificado. Puedes dejar el número vacío.</p>
          <label htmlFor="doc-country">País</label>
          <input
            id="doc-country"
            value={countryCode || event?.countryCode || ""}
            onChange={(input) => setCountryCode(input.target.value.toUpperCase())}
            maxLength={2}
            autoComplete="off"
          />
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
            setSuccess("");
            setError(new Error("Elige un archivo CSV."));
            return;
          }
          const body = new FormData();
          body.set("file", file);
          setError(null);
          setSuccess("");
          void api<{ participantCount: number }>(`/api/v1/admin/events/${eventId}/participants/import`, { method: "POST", body }).then(
            (result) => {
              setSuccess(`Se importaron ${result.participantCount} participantes.`);
              reload();
            },
            (reason: unknown) => fail(reason),
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
            setSuccess("");
            setError(new Error("Elige la hoja CSV y el ZIP."));
            return;
          }
          const body = new FormData();
          body.set("csv", csv);
          body.set("zip", zip);
          setError(null);
          setSuccess("");
          void api<{ participantCount: number }>(`/api/v1/admin/events/${eventId}/pregenerated/import`, { method: "POST", body }).then(
            (result) => {
              setSuccess(`Se importaron ${result.participantCount} participantes.`);
              reload();
            },
            (reason: unknown) => fail(reason),
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
        noValidate
        onSubmit={(submit) => {
          submit.preventDefault();
          const invalid = invalidFormMessage(submit.currentTarget);
          if (invalid) {
            setSuccess("");
            setError(new Error(invalid));
            return;
          }
          setError(null);
          setSuccess("");
          void api(`/api/v1/admin/events/${eventId}/venues`, {
            method: "POST",
            body: JSON.stringify({ name: venueName, code: venueCode }),
          }).then(
            () => {
              setVenueName("");
              setVenueCode("");
              setSuccess("Sede agregada.");
              reload();
            },
            (reason: unknown) => fail(reason),
          );
        }}
      >
        <h2>Sedes</h2>
        {venues.length === 0 ? <p>Este evento todavía no tiene sedes.</p> : null}
        {venues.length > 0 ? (
          <ul>
            {venues.map((venue) => (
              <li key={venue.id}>
                {venue.name} ({venue.code})
              </li>
            ))}
          </ul>
        ) : null}
        <h3>Agregar sede</h3>
        <label htmlFor="venue-name">Nombre</label>
        <input id="venue-name" value={venueName} onChange={(input) => setVenueName(input.target.value)} required />
        <label htmlFor="venue-code">Código</label>
        <input id="venue-code" value={venueCode} onChange={(input) => setVenueCode(input.target.value)} required />
        <button type="submit">Agregar sede</button>
      </form>
      {revokeId ? (
        <RevokeDialog
          onCancel={() => setRevokeId(null)}
          onConfirm={(reason) => {
            const id = revokeId;
            setRevokeId(null);
            setError(null);
            setSuccess("");
            void api(`/api/v1/admin/certificates/${id}/revoke`, {
              method: "POST",
              body: JSON.stringify(reason ? { revokeReason: reason } : {}),
            }).then(
              () => {
                setSuccess("Certificado revocado.");
                reload();
              },
              (failure: unknown) => fail(failure),
            );
          }}
        />
      ) : null}
    </>
  );
}
