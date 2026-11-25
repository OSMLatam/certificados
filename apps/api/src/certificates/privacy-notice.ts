import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type PrivacyVars = {
  siteName: string;
  contactEmail: string;
};

/** Turns the deployment markdown into HTML. The file cannot inject markup. */
export function renderPrivacyMarkdown(source: string, vars: PrivacyVars): string {
  const text = escapeHtml(source.replace(/<!--[\s\S]*?-->/g, ""))
    .replaceAll("{{SITE_NAME}}", escapeHtml(vars.siteName))
    .replaceAll("{{PRIVACY_CONTACT_EMAIL}}", contactHtml(vars.contactEmail))
    .replaceAll("{{PRIVACY_PATH}}", '<a href="/privacy">/privacy</a>');
  return renderBlocks(text);
}

export function loadPrivacyNotice(configuredPath: string, vars: PrivacyVars): string {
  const file = resolveNoticeFile(configuredPath);
  return renderPrivacyMarkdown(readFileSync(file, "utf8"), vars);
}

export function resolveNoticeFile(configuredPath: string): string {
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }
  const candidates = [
    path.resolve(process.cwd(), configuredPath),
    path.resolve(process.cwd(), "../..", configuredPath),
    path.resolve(__dirname, "../../../..", configuredPath),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

function renderBlocks(text: string): string {
  const html: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length === 0) {
      return;
    }
    html.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      list.push(trimmed.slice(2));
      continue;
    }
    flush();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.startsWith("# ")) {
      html.push(`<h1>${inline(trimmed.slice(2))}</h1>`);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      html.push(`<h2>${inline(trimmed.slice(3))}</h2>`);
      continue;
    }
    html.push(`<p>${inline(trimmed)}</p>`);
  }
  flush();
  return html.join("\n");
}

function inline(value: string): string {
  return value.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

function contactHtml(email: string): string {
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    return "el correo de contacto de la instancia";
  }
  return `<a href="mailto:${email}">${escapeHtml(email)}</a>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
