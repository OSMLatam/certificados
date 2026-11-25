export const CERTIFICATE_CANVAS = {
  width: 1754,
  height: 1240,
  unit: "px",
  paper: "A4",
  dpi: 150,
  orientation: "landscape",
} as const;

const TEXT_FIELDS = [
  "full_name",
  "document",
  "role_label",
  "activity_title",
  "event_name",
  "venue_name",
  "event_date",
  "certificate_slug",
] as const;

const FONT_FAMILIES = ["Noto Sans", "Noto Sans Bold", "Liberation Sans", "Liberation Sans Bold"] as const;

export type TextField = (typeof TEXT_FIELDS)[number];
export type FontFamily = (typeof FONT_FAMILIES)[number];

export type TextLayer = {
  field: TextField | LegalField;
  x: number;
  y: number;
  fontFamily: FontFamily;
  fontSize: number;
  align: "left" | "center" | "right";
  color: string;
};

export type QrLayer = {
  field: "permalink_qr";
  x: number;
  y: number;
  size: number;
};

export type LayoutLayer = TextLayer | QrLayer;

export type CertificateLayout = {
  canvas: {
    width: 1754;
    height: 1240;
    unit: "px";
    paper: "A4";
    dpi: 150;
    orientation: "landscape";
  };
  layers: LayoutLayer[];
};

type LegalField =
  | "legal.entity_name"
  | "legal.nit"
  | "legal.representative"
  | "legal.folio"
  | "legal.issue_city"
  | "legal.issue_date"
  | "legal.disclaimer"
  | `legal.signer.${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}.name`
  | `legal.signer.${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}.title`
  | `legal.signer.${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}.signature`;

const legalPattern =
  /^legal\.(entity_name|nit|representative|folio|issue_city|issue_date|disclaimer)$/;
const signerPattern = /^legal\.signer\.([1-8])\.(name|title|signature)$/;

export function isLegalField(field: string): boolean {
  return legalPattern.test(field) || signerPattern.test(field);
}

export function layoutHasLegal(layout: CertificateLayout): boolean {
  return layout.layers.some((layer) => isLegalField(layer.field));
}

export function minimalCertificateLayout(): CertificateLayout {
  return {
    canvas: { ...CERTIFICATE_CANVAS },
    layers: [
      text("event_name", 877, 260, "Liberation Sans", 36),
      text("full_name", 877, 460, "Liberation Sans Bold", 64),
      text("role_label", 877, 580, "Liberation Sans", 32),
      text("event_date", 877, 680, "Liberation Sans", 24),
      text("venue_name", 877, 760, "Liberation Sans", 22),
      text("certificate_slug", 877, 1120, "Liberation Sans", 16),
      { field: "permalink_qr", x: 80, y: 1020, size: 150 },
    ],
  };
}

export function parseCertificateLayout(
  value: unknown,
): { ok: true; layout: CertificateLayout } | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "El layout tiene que ser un objeto." };
  }
  const canvas = value.canvas;
  if (!isRecord(canvas)) {
    return { ok: false, message: "El layout no trae canvas." };
  }
  const canvasOk =
    canvas.width === CERTIFICATE_CANVAS.width &&
    canvas.height === CERTIFICATE_CANVAS.height &&
    canvas.unit === "px" &&
    canvas.paper === "A4" &&
    canvas.dpi === 150 &&
    canvas.orientation === "landscape";
  if (!canvasOk) {
    return { ok: false, message: "El canvas tiene que ser A4 apaisado a 150 DPI (1754×1240)." };
  }
  if (!Array.isArray(value.layers) || value.layers.length === 0) {
    return { ok: false, message: "La plantilla necesita al menos una capa." };
  }
  if (value.layers.length > 40) {
    return { ok: false, message: "La plantilla admite hasta 40 capas." };
  }
  const layers: LayoutLayer[] = [];
  for (const layer of value.layers) {
    const parsed = parseLayer(layer);
    if (!parsed.ok) {
      return parsed;
    }
    layers.push(parsed.layer);
  }
  return { ok: true, layout: { canvas: { ...CERTIFICATE_CANVAS }, layers } };
}

function parseLayer(value: unknown): { ok: true; layer: LayoutLayer } | { ok: false; message: string } {
  if (!isRecord(value) || typeof value.field !== "string") {
    return { ok: false, message: "Hay una capa sin campo." };
  }
  if (value.field === "permalink_qr") {
    if (!isCoordinate(value.x, 1754) || !isCoordinate(value.y, 1240) || typeof value.size !== "number") {
      return { ok: false, message: "El QR necesita x, y y size." };
    }
    if (value.size < 40 || value.size > 400) {
      return { ok: false, message: "El QR tiene que medir entre 40 y 400 px." };
    }
    return { ok: true, layer: { field: "permalink_qr", x: value.x, y: value.y, size: value.size } };
  }
  if (!isTextField(value.field)) {
    return { ok: false, message: `El campo ${value.field} no está en el catálogo.` };
  }
  if (!isCoordinate(value.x, 1754) || !isCoordinate(value.y, 1240)) {
    return { ok: false, message: `La capa ${value.field} tiene una posición inválida.` };
  }
  const fontFamily = value.fontFamily ?? "Liberation Sans";
  if (!isFontFamily(fontFamily)) {
    return { ok: false, message: `La fuente de ${value.field} no está permitida.` };
  }
  const fontSize = value.fontSize ?? 32;
  if (typeof fontSize !== "number" || fontSize < 8 || fontSize > 200) {
    return { ok: false, message: `El tamaño de ${value.field} tiene que estar entre 8 y 200.` };
  }
  const align = value.align ?? "left";
  if (align !== "left" && align !== "center" && align !== "right") {
    return { ok: false, message: `La alineación de ${value.field} no es válida.` };
  }
  const color = value.color ?? "#1a1a1a";
  if (typeof color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return { ok: false, message: `El color de ${value.field} tiene que ser #RRGGBB.` };
  }
  return {
    ok: true,
    layer: { field: value.field, x: value.x, y: value.y, fontFamily, fontSize, align, color },
  };
}

function text(
  field: TextField,
  x: number,
  y: number,
  fontFamily: FontFamily,
  fontSize: number,
): TextLayer {
  return { field, x, y, fontFamily, fontSize, align: "center", color: "#1a1a1a" };
}

function isFontFamily(value: unknown): value is FontFamily {
  return typeof value === "string" && (FONT_FAMILIES as readonly string[]).includes(value);
}

function isTextField(field: string): field is TextLayer["field"] {
  return (TEXT_FIELDS as readonly string[]).includes(field) || isLegalField(field);
}

function isCoordinate(value: unknown, max: number): value is number {
  return typeof value === "number" && value >= 0 && value <= max && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
