export function openGraphTags(input: { title: string; description: string; url: string }): string {
  return [
    meta("og:title", input.title),
    meta("og:description", input.description),
    meta("og:url", input.url),
    meta("og:type", "website"),
  ].join("\n");
}

function meta(property: string, content: string): string {
  return `<meta property="${escapeAttr(property)}" content="${escapeAttr(content)}">`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
