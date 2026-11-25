import { useEffect, useState, type ReactNode } from "react";
import { api, type Me } from "./api";

export function AdminShell({ title, children }: { title: string; children: (me: Me) => ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    void api<Me>("/api/v1/admin/auth/me").then(setMe, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Inicia sesión para usar el panel.");
    });
  }, []);

  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <div className="admin">
        <header className="admin-bar">
          <p>{me ? me.osmUsername : "Panel"}</p>
          <nav aria-label="Panel">
            <a href="/admin">Inicio</a>
            <a href="/admin/events">Eventos</a>
            {me?.role === "admin" ? <a href="/admin/users">Usuarios</a> : null}
            {me?.role === "admin" ? <a href="/admin/audit">Auditoría</a> : null}
          </nav>
        </header>
        <main id="contenido">
          {error ? (
            <p role="status">
              {error} <a href="/admin/login">Entrar</a>
            </p>
          ) : null}
          {!me && !error ? <p>Cargando…</p> : null}
          {me?.role ? children(me) : null}
          {me && !me.role ? <p role="status">Tu sesión no tiene acceso al panel.</p> : null}
        </main>
      </div>
    </>
  );
}
