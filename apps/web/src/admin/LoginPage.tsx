import { useEffect } from "react";

export function LoginPage() {
  useEffect(() => {
    document.title = "Entrar al panel";
  }, []);

  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <main className="admin" id="contenido">
        <h1>Entrar al panel</h1>
        <p>El acceso usa tu cuenta de OpenStreetMap. No hay contraseña de este sitio.</p>
        <p>
          <a className="button-link" href="/api/v1/admin/auth/osm/start">
            Entrar con OpenStreetMap
          </a>
        </p>
      </main>
    </>
  );
}
