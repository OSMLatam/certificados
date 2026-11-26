export type PublicChrome = {
  siteName: string;
  footerText: string;
  creditEnabled: boolean;
  softwareName: string;
  softwareRepoUrl: string;
  creditText: string;
};

export function publicDocument(options: { title: string; chrome: PublicChrome; main: string; script?: string }): string {
  const script = options.script ? `<script>\n${options.script}\n</script>` : "";
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noai, noimageai">
<title>${escapeHtml(options.title)}</title>
<style>
  body { margin: 0; font-family: "Liberation Sans", "Noto Sans", sans-serif; background: #f4f7f4; color: #1a1a1a; }
  main, footer { max-width: 40rem; margin: 0 auto; padding: 2rem 1.25rem; }
  footer { padding-top: 0; }
  h1 { font-size: 1.6rem; }
  p, li, label, legend { line-height: 1.5; }
  form { display: grid; gap: 0.75rem; margin: 1.5rem 0; }
  fieldset { border: 1px solid #5c6b5c; margin: 0; padding: 0.75rem; }
  label { display: block; font-weight: 700; }
  input { font: inherit; width: 100%; max-width: 22rem; padding: 0.4rem; box-sizing: border-box; }
  button { font: inherit; background: #0b3d0b; color: #fff; border: 0; border-radius: 4px; padding: 0.5rem 0.9rem; cursor: pointer; }
  a { color: #0b3d0b; }
  a:focus, button:focus, input:focus { outline: 3px solid #0b3d0b; outline-offset: 2px; }
  .skip { position: absolute; left: -999px; top: 0; background: #fff; color: #1a1a1a; padding: 0.4rem 0.6rem; }
  .skip:focus { left: 1rem; top: 1rem; }
  nav a { margin-right: 1rem; }
  ul { padding-left: 1.1rem; }
  li { margin: 0.8rem 0; }
  .status { min-height: 1.4rem; }
  dl { display: grid; grid-template-columns: 11rem 1fr; gap: 0.4rem 1rem; }
  dt { font-weight: 700; }
  dd { margin: 0; }
  code { font-family: ui-monospace, monospace; word-break: break-all; }
</style>
</head>
<body>
<a class="skip" href="#contenido">Saltar al contenido</a>
<main id="contenido">
${options.main}
</main>
${publicFooter(options.chrome)}
${script}
</body>
</html>`;
}

export function publicFooter(chrome: PublicChrome): string {
  const organization = chrome.footerText ? `<p>${escapeHtml(chrome.footerText)}</p>` : "";
  return `<footer>
  <p>${escapeHtml(chrome.siteName)}</p>
  ${organization}
  <nav aria-label="Sitio">
    <a href="/">Buscar certificados</a>
    <a href="/privacy">Datos personales</a>
    <a href="/about">Acerca de</a>
    <a href="/help">Ayuda</a>
  </nav>
  ${softwareCredit(chrome)}
</footer>`;
}

export function softwareCredit(chrome: PublicChrome): string {
  if (!chrome.creditEnabled) {
    return "";
  }
  const href = safeHttpUrl(chrome.softwareRepoUrl);
  if (chrome.creditText.trim()) {
    const link = href ? ` <a href="${escapeHtml(href)}">Código fuente</a>` : "";
    return `<p>${escapeHtml(chrome.creditText)}${link}</p>`;
  }
  const name = escapeHtml(chrome.softwareName);
  const linked = href ? `<a href="${escapeHtml(href)}">${name}</a>` : name;
  return `<p>Software libre — ${linked} (MIT)</p>`;
}

export function aboutMain(chrome: PublicChrome): string {
  const href = safeHttpUrl(chrome.softwareRepoUrl);
  const repo = href
    ? `<a href="${escapeHtml(href)}">${escapeHtml(chrome.softwareRepoUrl)}</a>`
    : escapeHtml(chrome.softwareRepoUrl);
  return `<h1>Acerca de</h1>
<p>${escapeHtml(chrome.siteName)} es un despliegue independiente. Los certificados los emite esta instancia.</p>
<p>El programa se llama ${escapeHtml(chrome.softwareName)}. Su código está en ${repo} y se publica con licencia MIT.</p>`;
}

function safeHttpUrl(value: string): string | null {
  if (!/^https?:\/\//.test(value)) {
    return null;
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
