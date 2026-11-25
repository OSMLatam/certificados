import { useEffect, useState } from "react";
import { AccessNote, AdminShell } from "../admin/AdminShell";
import { FormAlert } from "../admin/FormAlert";
import { failureFromBody } from "../admin/form-feedback";

const ACTIONS: { value: string; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "participant_csv_import", label: "Importación de participantes" },
  { value: "pregenerated_import", label: "Importación de certificados" },
  { value: "event_status_change", label: "Cambio de estado del evento" },
  { value: "event_soft_delete", label: "Evento retirado" },
  { value: "certificate_retry_issue", label: "Reintento de generación" },
  { value: "certificate_revoke", label: "Revocación de certificado" },
  { value: "template_export", label: "Exportación de plantilla" },
  { value: "template_import", label: "Importación de plantilla" },
  { value: "user_role_change", label: "Cambio de rol de panel" },
  { value: "user_activation_change", label: "Activación de cuenta" },
];

type AuditItem = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: { name: string } | null;
  metadata: Record<string, unknown>;
};

type Page = { items: AuditItem[]; meta: { page: number; pageSize: number; total: number } };

export function AuditPage() {
  return (
    <AdminShell title="Registro de auditoría">
      {(me) => (me.role === "admin" ? <AuditLog /> : <AccessNote me={me} reason="section" />)}
    </AdminShell>
  );
}

function AuditLog() {
  const [access, setAccess] = useState<"loading" | "anon" | "forbidden" | "ready">("loading");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    document.title = "Registro de auditoría";
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/admin/auth/me", { credentials: "include" }).then(async (response) => {
      if (cancelled) return;
      if (response.status === 401) {
        setAccess("anon");
        return;
      }
      const user = (await response.json()) as { role?: string | null };
      setAccess(user.role === "admin" ? "ready" : "forbidden");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (access !== "ready") return;
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    let cancelled = false;
    void fetch(`/api/v1/admin/audit-log?${params}`, { credentials: "include" }).then(async (response) => {
      if (cancelled) return;
      if (response.status === 403) {
        setAccess("forbidden");
        return;
      }
      if (!response.ok) {
        setError(failureFromBody(await response.json().catch(() => null), response.status));
        setResult(null);
        return;
      }
      setError(null);
      setResult((await response.json()) as Page);
    });
    return () => {
      cancelled = true;
    };
  }, [access, action, from, to, page]);

  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <main className="audit" id="contenido">
        <h1>Registro de auditoría</h1>
        <p>
          <a href="/admin">Volver al panel</a>
        </p>
        {access === "loading" ? <p>Cargando…</p> : null}
        {access === "anon" ? <p role="status">Inicia sesión para ver el registro.</p> : null}
        {access === "forbidden" ? (
          <p role="status">Iniciaste sesión, pero tu rol no puede ver esta sección. Pide el acceso a un administrador.</p>
        ) : null}
        {access === "ready" ? (
          <>
            <form
              className="filters"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
              }}
            >
              <label>
                Acción
                <select
                  value={action}
                  onChange={(event) => {
                    setAction(event.target.value);
                    setPage(1);
                  }}
                >
                  {ACTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Desde
                <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
              </label>
              <label>
                Hasta
                <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
              </label>
            </form>
            <FormAlert error={error} />
            {result && result.items.length === 0 ? <p role="status">No hay registros con esos filtros.</p> : null}
            {result && result.items.length > 0 ? (
              <table>
                <caption>Acciones del panel, de la más reciente a la más antigua.</caption>
                <thead>
                  <tr>
                    <th>Cuándo</th>
                    <th>Quién</th>
                    <th>Acción</th>
                    <th>Entidad</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.createdAt.replace("T", " ").slice(0, 16)}</td>
                      <td>{item.actor?.name ?? "Sistema"}</td>
                      <td>{ACTIONS.find((entry) => entry.value === item.action)?.label ?? item.action}</td>
                      <td>{item.entityType}</td>
                      <td>{detail(item.metadata)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {result ? (
              <p className="pager">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </button>
                <span>
                  Página {result.meta.page} de {Math.max(1, Math.ceil(result.meta.total / result.meta.pageSize))}
                </span>
                <button
                  type="button"
                  disabled={page * result.meta.pageSize >= result.meta.total}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                </button>
              </p>
            ) : null}
          </>
        ) : null}
      </main>
    </>
  );
}

function detail(metadata: Record<string, unknown>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" · ");
}
