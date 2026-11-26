import { publicDocument, type PublicChrome } from "./public-chrome";

const searchScript = `
const form = document.getElementById("buscar");
const estado = document.getElementById("estado");
const lista = document.getElementById("resultados");
const campos = { email: "email", countryCode: "country", docTypeCode: "doc-type", docNumber: "doc-number" };
const etiquetas = { pending: "Aún no generado", issued: "Válido", failed: "No generado", revoked: "Revocado" };

function rolConActividad(label, activity) {
  if (!activity) return label;
  return label + ' — "' + activity + '"';
}

function limpiarCampos() {
  for (const id of Object.values(campos)) {
    const input = document.getElementById(id);
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  }
}

function mostrarError(message, field) {
  estado.textContent = message;
  estado.setAttribute("role", "alert");
  limpiarCampos();
  const input = document.getElementById(campos[field] || "email");
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-describedby", "estado");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const body = {};
  for (const [key, value] of data.entries()) {
    if (typeof value === "string" && value.trim()) body[key] = value.trim();
  }
  limpiarCampos();
  estado.setAttribute("role", "status");
  estado.textContent = "Buscando…";
  lista.replaceChildren();
  fetch("/api/v1/public/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (response.status === 429) {
      mostrarError("Demasiadas solicitudes. Espera un momento.", "email");
      return;
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload && payload.details && payload.details[0];
      mostrarError(detail ? detail.message : "No se pudo buscar.", detail ? detail.field : "email");
      return;
    }
    if (!payload.items || payload.items.length === 0) {
      estado.setAttribute("role", "status");
      estado.textContent = payload.message || "No encontramos credenciales con esos datos.";
      return;
    }
    estado.setAttribute("role", "status");
    estado.textContent = payload.items.length === 1 ? "1 certificado." : payload.items.length + " certificados.";
    for (const item of payload.items) {
      const line = document.createElement("li");
      const link = document.createElement("a");
      link.href = "/c/" + encodeURIComponent(item.slug);
      link.textContent = item.eventName + " — " + rolConActividad(item.roleLabel, item.activityTitle);
      const detail = document.createElement("div");
      const ayuda = item.status === "pending" ? "se genera al abrir el enlace" : "";
      detail.textContent = [etiquetas[item.status] || item.status, ayuda, item.eventDate, item.venueName].filter(Boolean).join(" · ");
      line.append(link, detail);
      lista.append(line);
    }
  }).catch(() => {
    mostrarError("No se pudo buscar.", "email");
  });
});
`;

export function searchPage(chrome: PublicChrome): string {
  const main = `<h1>Buscar certificados</h1>
  <p>Escribe tu correo, o el país, el tipo y el número del documento.</p>
  <form id="buscar">
    <div>
      <label for="email">Correo</label>
      <input id="email" name="email" type="email" autocomplete="email">
    </div>
    <fieldset>
      <legend>Documento</legend>
      <label for="country">País</label>
      <input id="country" name="countryCode" maxlength="2" autocomplete="country">
      <label for="doc-type">Tipo</label>
      <input id="doc-type" name="docTypeCode" maxlength="10">
      <label for="doc-number">Número</label>
      <input id="doc-number" name="docNumber" maxlength="100">
    </fieldset>
    <button type="submit">Buscar</button>
  </form>
  <p><a href="/help">¿No encuentras tu certificado? Mira la ayuda</a></p>
  <p id="estado" class="status"></p>
  <ul id="resultados"></ul>`;
  return publicDocument({ title: `${chrome.siteName}: buscar certificados`, chrome, main, script: searchScript });
}
