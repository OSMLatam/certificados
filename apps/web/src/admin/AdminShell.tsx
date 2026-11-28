import { useEffect, useState, type ReactNode } from "react";
import { api, type Me } from "./api";
import { accessMessage } from "./access-message";

export function AdminShell({ title, children }: { title: string; children: (me: Me) => ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    void api<Me>("/api/v1/admin/auth/me").then(setMe, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Inicia sesión con tu cuenta de OpenStreetMap para entrar al panel");
    });
  }, []);

  const allowed = Boolean(me?.isActive && me.role);

  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <div className="admin">
        <header className="admin-bar">
          <p>{me ? me.osmUsername : "Panel"}</p>
          {me ? (
            <button type="button" onClick={() => logout()}>
              Cerrar sesión
            </button>
          ) : null}
          {allowed ? (
            <nav aria-label="Panel">
              <a href="/admin">Inicio</a>
              <a href="/admin/events">Eventos</a>
              {me?.role === "admin" ? <a href="/admin/users">Usuarios</a> : null}
              {me?.role === "admin" ? <a href="/admin/audit">Auditoría</a> : null}
              {me?.role === "admin" && me.instance === "ac3" ? <a href="/admin/legal">Datos legales</a> : null}
            </nav>
          ) : null}
        </header>
        <main id="contenido">
          {error ? (
            <>
              <p role="status">{error}</p>
              <p>
                <a className="button-link" href="/admin/login">
                  Entrar
                </a>
              </p>
            </>
          ) : null}
          {!me && !error ? <p>Cargando…</p> : null}
          {me && !me.isActive ? (
            <AccessNote me={me} reason="inactive" />
          ) : null}
          {me?.isActive && !me.role ? <AccessNote me={me} reason="role" /> : null}
          {allowed && me ? children(me) : null}
        </main>
      </div>
    </>
  );
}

export function AccessNote({ me, reason }: { me: Me; reason: "role" | "inactive" | "section" }) {
  return (
    <>
      <p role="status">{accessMessage({ osmUsername: me.osmUsername, contactEmail: me.contactEmail ?? "", reason })}</p>
      <p>
        <a href="/">Volver a la página pública</a>
      </p>
    </>
  );
}

function logout(): void {
  void fetch("/api/v1/admin/auth/logout", { method: "POST", credentials: "include" }).finally(() => {
    window.location.assign("/");
  });
}
