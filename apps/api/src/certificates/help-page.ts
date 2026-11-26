import { publicDocument, type PublicChrome } from "./public-chrome";
import { HELP_MARKDOWN } from "./help-content";

export function helpMain(publicBaseUrl: string): string {
  const base = publicBaseUrl.replace(/\/$/, "");
  return renderHelp(HELP_MARKDOWN.replaceAll("{{PUBLIC_BASE_URL}}", base));
}

export function helpPage(chrome: PublicChrome, publicBaseUrl: string): string {
  return publicDocument({ title: `${chrome.siteName}: ayuda`, chrome, main: helpMain(publicBaseUrl) });
}

function renderHelp(source: string): string {
  const html: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length === 0) {
      return;
    }
    html.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      list.push(trimmed.slice(2));
      continue;
    }
    flush();
    if (trimmed.length === 0 || trimmed === "---") {
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
  const parts: string[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const match of value.matchAll(pattern)) {
    parts.push(escapeHtml(value.slice(last, match.index)));
    if (match[1] !== undefined && match[2] !== undefined) {
      const href = safeHref(match[2]);
      parts.push(href ? `<a href="${escapeHtml(href)}">${escapeHtml(match[1])}</a>` : escapeHtml(`${match[1]} (${match[2]})`));
    } else if (match[3] !== undefined) {
      parts.push(`<strong>${escapeHtml(match[3])}</strong>`);
    } else if (match[4] !== undefined) {
      parts.push(`<code>${escapeHtml(match[4])}</code>`);
    }
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(escapeHtml(value.slice(last)));
  return parts.join("");
}

function safeHref(value: string): string | null {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
