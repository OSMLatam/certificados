import type { CertificateLayout, LayoutLayer } from "@certificados/shared";

export type CertificateValues = {
  full_name: string;
  document: string;
  role_label: string;
  activity_title: string;
  event_name: string;
  venue_name: string;
  event_date: string;
  certificate_slug: string;
  permalink: string;
};

const FAMILY: Record<string, { family: string; weight: number }> = {
  "Noto Sans": { family: "Liberation Sans", weight: 400 },
  "Noto Sans Bold": { family: "Liberation Sans", weight: 700 },
  "Liberation Sans": { family: "Liberation Sans", weight: 400 },
  "Liberation Sans Bold": { family: "Liberation Sans", weight: 700 },
};

export function renderCertificateHtml(input: {
  layout: CertificateLayout;
  values: CertificateValues;
  qrSvg: string;
  fontFaceCss: string;
  backgroundDataUri?: string;
}): string {
  const layers = input.layout.layers.map((layer) => renderLayer(layer, input.values, input.qrSvg)).join("");
  const background = backgroundCss(input.backgroundDataUri);
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
${input.fontFaceCss}
@page { size: 297mm 210mm; margin: 0; }
html, body { margin: 0; padding: 0; width: 297mm; height: 210mm; overflow: hidden; }
.canvas {
  width: 297mm;
  height: 210mm;
  position: relative;
  overflow: hidden;
  background: ${background};
}
.layer { position: absolute; white-space: pre; color: #1a1a1a; }
</style>
</head>
<body><div class="canvas">${layers}</div></body>
</html>`;
}

function renderLayer(layer: LayoutLayer, values: CertificateValues, qrSvg: string): string {
  if (layer.field === "permalink_qr") {
    const box = `left:${mm(layer.x)};top:${mm(layer.y)};width:${mm(layer.size)};height:${mm(layer.size)}`;
    return `<div class="layer" style="${box};overflow:hidden">${embedQrSvg(qrSvg)}</div>`;
  }
  const font = FAMILY[layer.fontFamily] ?? FAMILY["Liberation Sans"]!;
  const shift = layer.align === "center" ? "transform:translateX(-50%);" : layer.align === "right" ? "transform:translateX(-100%);" : "";
  const text = layer.field in values ? values[layer.field as keyof CertificateValues] : "";
  return `<div class="layer" style="left:${mm(layer.x)};top:${mm(layer.y)};${shift}font-family:'${font.family}';font-weight:${font.weight};font-size:${mm(layer.fontSize)};color:${layer.color};text-align:${layer.align}">${escapeHtml(text)}</div>`;
}

function mm(value: number): string {
  return `${(Number(value) * 25.4) / 150}mm`;
}

/** The QR library sizes the SVG in CSS pixels. Stretch it to the layout box instead. */
export function embedQrSvg(svg: string): string {
  const withoutPreamble = svg.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[^>]*>/g, "");
  return withoutPreamble.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = attrs.replace(/\s(?:width|height)="[^"]*"/gi, "");
    return `<svg${cleaned} width="100%" height="100%" style="display:block;width:100%;height:100%">`;
  });
}

function backgroundCss(uri: string | undefined): string {
  if (uri && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(uri)) {
    return `#ffffff url("${uri}") center / 100% 100% no-repeat`;
  }
  return "#ffffff";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
