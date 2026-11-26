import { useEffect, useState } from "react";
import { api } from "./api";
import { FormAlert } from "./FormAlert";
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
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void api<Summary>("/api/v1/admin/summary").then(setSummary, (reason: unknown) => setError(reason));
  }, []);

  return (
    <>
      <h1>Panel</h1>
      <FormAlert error={error} />
      {summary ? (
        <ul>
          <li>{summary.events} eventos</li>
          <li>{summary.participants} participantes</li>
          <li>
            Certificados: {summary.certificates.pending} aún no generados, {summary.certificates.issued} válidos, {summary.certificates.failed} no generados
          </li>
        </ul>
      ) : null}
    </>
  );
}
