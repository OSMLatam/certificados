import { publicDocument, type PublicChrome } from "./public-chrome";

export function permalinkPage(slug: string, chrome: PublicChrome, contactEmail: string): string {
  const main = `<h1>Certificado</h1>
  <p><a href="/">Buscar mis certificados</a></p>
  <p id="estado" role="status">Cargando el certificado…</p>`;
  const script = `
const slug = ${JSON.stringify(slug)};
const contactEmail = ${JSON.stringify(contactEmail)};
const root = document.getElementById("contenido");
const estado = document.getElementById("estado");
const etiquetas = { pending: "Pendiente", issued: "Válido", failed: "No generado", revoked: "Revocado" };

function field(label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  return [dt, dd];
}

fetch("/api/v1/public/certificates/" + encodeURIComponent(slug))
  .then(async (response) => {
    if (response.status === 404) {
      estado.textContent = "No encontramos ese certificado.";
      return;
    }
    if (response.status === 429) {
      estado.textContent = "Demasiadas solicitudes. Espera un momento y vuelve a cargar.";
      return;
    }
    if (response.status === 503) {
      estado.textContent = "El certificado se está generando. Vuelve a cargar la página.";
      return;
    }
    const data = await response.json();
    estado.textContent = "Estado: " + (etiquetas[data.status] || data.status);
    if (data.status === "revoked") {
      if (data.revokedAt) {
        const when = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Bogota" }).format(new Date(data.revokedAt));
        const line = document.createElement("p");
        line.textContent = "Revocado el " + when;
        root.append(line);
      }
      if (contactEmail) {
        const help = document.createElement("p");
        help.textContent = "Si crees que es un error, escribe a " + contactEmail;
        root.append(help);
      }
      return;
    }
    const list = document.createElement("dl");
    const rows = data.status === "issued"
      ? [
          ["Nombre", data.fullName],
          ["Evento", data.eventName],
          ["Rol", data.roleLabel],
          ["Fecha del evento", data.eventDate],
          ["Sede", data.venueName],
          ["Documento", data.documentMasked],
          ["Emisor", data.issuer],
          ["Emitido", data.issuedAt ? new Date(data.issuedAt).toLocaleString("es-CO") : ""],
          ["Suma de comprobación", data.checksumSha256],
        ]
      : [["Documento", data.documentMasked]];
    for (const [label, value] of rows) {
      if (value) list.append(...field(label, value));
    }
    if (list.childElementCount > 0) root.append(list);
    if (data.status !== "issued") {
      return;
    }
    const link = document.createElement("p");
    const anchor = document.createElement("a");
    anchor.href = "/api/v1/public/certificates/" + encodeURIComponent(slug) + "/file";
    anchor.textContent = "Descargar certificado";
    link.append(anchor);
    root.append(link);
  })
  .catch(() => {
    estado.textContent = "No se pudo consultar el certificado.";
  });
`;
  return publicDocument({ title: `${chrome.siteName}: certificado`, chrome, main, script });
}
