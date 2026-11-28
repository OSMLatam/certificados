import { publicDocument, type PublicChrome } from "../certificates/public-chrome";
import { openGraphTags } from "../certificates/open-graph";
import type { BadgeJson } from "./open-badges";

export function badgePage(
  slug: string,
  chrome: PublicChrome,
  contactEmail: string,
  pageUrl: string,
  jsonLd: BadgeJson | null = null,
  imageUrl = "",
): string {
  const main = `<h1>Insignia</h1>
  <p><a href="/">Buscar mis certificados</a></p>
  <p id="estado" role="status">Cargando la insignia…</p>`;
  const script = `
const slug = ${JSON.stringify(slug)};
const contactEmail = ${JSON.stringify(contactEmail)};
const root = document.getElementById("contenido");
const estado = document.getElementById("estado");
const etiquetas = { pending: "Aún no emitida", issued: "Válida", revoked: "Revocada" };

function field(label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  return [dt, dd];
}

fetch("/api/v1/public/badges/" + encodeURIComponent(slug))
  .then(async (response) => {
    if (response.status === 404) {
      estado.textContent = "No encontramos esa insignia.";
      return;
    }
    if (response.status === 429) {
      estado.textContent = "Demasiadas solicitudes. Espera un momento y vuelve a cargar.";
      return;
    }
    const data = await response.json();
    estado.textContent = "Estado: " + (etiquetas[data.status] || data.status);
    if (data.status === "revoked") {
      if (data.revokedAt) {
        const when = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Bogota" }).format(new Date(data.revokedAt));
        const line = document.createElement("p");
        line.textContent = "Revocada el " + when;
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
    const issuedOn = data.issuedAt ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" }).format(new Date(data.issuedAt)) : "";
    for (const [label, value] of [["Persona", data.recipientName], ["Insignia", data.className], ["Emisor", data.issuerName], ["Fecha", issuedOn], ["Certificado", data.evidencePermalink]]) {
      if (value) list.append(...field(label, value));
    }
    if (list.childElementCount > 0) root.append(list);
    if (data.assertionUrl) {
      const spec = document.createElement("p");
      const jsonLink = document.createElement("a");
      jsonLink.href = data.assertionUrl;
      jsonLink.textContent = "Ver el JSON-LD de la insignia";
      spec.append(jsonLink);
      root.append(spec);
    }
    if (data.status === "issued" && data.assertionUrl) {
      const backpack = document.createElement("p");
      const badgr = document.createElement("a");
      badgr.href = "https://badgr.com/earner/add?url=" + encodeURIComponent(data.assertionUrl);
      badgr.textContent = "Agregar a Badgr";
      const passport = document.createElement("a");
      passport.href = "https://openbadgepassport.com/app/badge/info?url=" + encodeURIComponent(data.assertionUrl);
      passport.textContent = "Agregar a Open Badge Passport";
      backpack.append(badgr, document.createTextNode(" · "), passport);
      root.append(backpack);
    }
  })
  .catch(() => {
    estado.textContent = "No se pudo cargar la insignia.";
  });
`;
  return publicDocument({
    title: "Insignia",
    chrome,
    main,
    script,
    head: `${openGraphTags({
      title: `Insignia · ${chrome.siteName}`,
      description: "Insignia verificable de un certificado.",
      url: pageUrl,
      image: imageUrl || undefined,
    })}\n${jsonLdScript(jsonLd)}`,
  });
}

function jsonLdScript(document: BadgeJson | null): string {
  if (!document) {
    return "";
  }
  return `<script type="application/ld+json">${JSON.stringify(document).replace(/</g, "\\u003c")}</script>`;
}
