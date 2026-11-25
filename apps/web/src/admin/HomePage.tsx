import { useEffect, useState } from "react";
import { api } from "./api";
import { AdminShell } from "./AdminShell";

type Summary = { events: number; participants: number; certificates: { pending: number; issued: number; failed: number } };

export function HomePage() {
  return (
    <AdminShell title="Panel">
      {() => <HomeBody />}
    </AdminShell>
  );
}

function HomeBody() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<Summary>("/api/v1/admin/summary").then(setSummary, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "No se pudieron cargar los conteos.");
    });
  }, []);

  return (
    <>
      <h1>Panel</h1>
      {error ? <p role="alert">{error}</p> : null}
      {summary ? (
        <ul>
          <li>{summary.events} eventos</li>
          <li>{summary.participants} participantes</li>
          <li>
            Certificados: {summary.certificates.pending} pendientes, {summary.certificates.issued} válidos, {summary.certificates.failed} no generados
          </li>
        </ul>
      ) : null}
    </>
  );
}
