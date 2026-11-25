import {
  CERTIFICATE_CANVAS,
  isLegalField,
  type CertificateLayout,
  type FontFamily,
  type LayoutLayer,
  type TextField,
  type TextLayer,
} from "./layout";

export const TEMPLATE_SCHEMA_VERSION = 1;

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

const ROOT_KEYS = ["meta", "canvas", "layers"] as const;
const META_KEYS = ["schemaVersion", "exportedAt", "instance", "sourceEventName", "roleCode"] as const;
const CANVAS_KEYS = ["width", "height", "unit", "paper", "dpi", "orientation"] as const;
const TEXT_KEYS = ["field", "x", "y", "fontFamily", "fontSize", "align", "color"] as const;
const QR_KEYS = ["field", "x", "y", "size"] as const;

export type TemplatePackageIssue = { field: string; message: string };

export type TemplatePackageMeta = {
  schemaVersion: 1;
  exportedAt: string;
  instance: "osm_lat" | "ac3";
  sourceEventName: string;
  roleCode: string | null;
};

export function buildTemplatePackage(layout: CertificateLayout, meta: Omit<TemplatePackageMeta, "schemaVersion">): {
  meta: TemplatePackageMeta;
  canvas: CertificateLayout["canvas"];
  layers: LayoutLayer[];
} {
  return {
    meta: { schemaVersion: TEMPLATE_SCHEMA_VERSION, ...meta },
    canvas: { ...layout.canvas },
    layers: layout.layers.map((layer) => ({ ...layer })),
  };
}

export function parseTemplatePackage(
  value: unknown,
  options: { allowLegal: boolean },
): { ok: true; layout: CertificateLayout } | { ok: false; issues: TemplatePackageIssue[] } {
  const issues: TemplatePackageIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ field: "layout", message: "El archivo tiene que ser un objeto JSON." }] };
  }
  rejectUnknown(value, ROOT_KEYS, "", issues);
  rejectExternalStrings(value, "", issues);
  parseMeta(value.meta, issues);
  const canvasOk = parseCanvas(value.canvas, issues);
  const layers = Array.isArray(value.layers) ? parseLayers(value.layers, options.allowLegal, issues) : null;
  if (!Array.isArray(value.layers)) {
    issues.push({ field: "layers", message: "La plantilla necesita la lista de capas." });
  }
  if (issues.length > 0 || !canvasOk || !layers) {
    return { ok: false, issues };
  }
  return { ok: true, layout: { canvas: { ...CERTIFICATE_CANVAS }, layers } };
}

function parseMeta(value: unknown, issues: TemplatePackageIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ field: "meta", message: "Falta el bloque meta." });
    return;
  }
  rejectUnknown(value, META_KEYS, "meta", issues);
  if (value.schemaVersion !== TEMPLATE_SCHEMA_VERSION) {
    issues.push({ field: "meta.schemaVersion", message: "La versión del archivo no está soportada." });
  }
  if (typeof value.exportedAt !== "string" || value.exportedAt.trim().length === 0) {
    issues.push({ field: "meta.exportedAt", message: "Falta la fecha de exportación." });
  }
  if (value.instance !== "osm_lat" && value.instance !== "ac3") {
    issues.push({ field: "meta.instance", message: "La instancia tiene que ser osm_lat o ac3." });
  }
  if (typeof value.sourceEventName !== "string" || value.sourceEventName.trim().length === 0) {
    issues.push({ field: "meta.sourceEventName", message: "Falta el nombre del evento de origen." });
  }
  if (value.roleCode !== null && (typeof value.roleCode !== "string" || value.roleCode.trim().length === 0)) {
    issues.push({ field: "meta.roleCode", message: "El rol tiene que ser un texto o null." });
  }
}

function parseCanvas(value: unknown, issues: TemplatePackageIssue[]): boolean {
  if (!isRecord(value)) {
    issues.push({ field: "canvas", message: "El layout no trae canvas." });
    return false;
  }
  rejectUnknown(value, CANVAS_KEYS, "canvas", issues);
  const matches =
    value.width === CERTIFICATE_CANVAS.width &&
    value.height === CERTIFICATE_CANVAS.height &&
    value.unit === "px" &&
    value.paper === "A4" &&
    value.dpi === 150 &&
    value.orientation === "landscape";
  if (!matches) {
    issues.push({ field: "canvas", message: "El canvas tiene que ser A4 apaisado a 150 DPI (1754×1240)." });
    return false;
  }
  return true;
}

function parseLayers(values: unknown[], allowLegal: boolean, issues: TemplatePackageIssue[]): LayoutLayer[] | null {
  if (values.length === 0) {
    issues.push({ field: "layers", message: "La plantilla necesita al menos una capa." });
    return null;
  }
  if (values.length > 40) {
    issues.push({ field: "layers", message: "La plantilla admite hasta 40 capas." });
    return null;
  }
  const layers: LayoutLayer[] = [];
  let failed = false;
  values.forEach((value, index) => {
    const parsed = parseLayer(value, index, allowLegal, issues);
    if (parsed) {
      layers.push(parsed);
    } else {
      failed = true;
    }
  });
  return failed ? null : layers;
}

function parseLayer(value: unknown, index: number, allowLegal: boolean, issues: TemplatePackageIssue[]): LayoutLayer | null {
  const path = `layers[${index}]`;
  if (!isRecord(value) || typeof value.field !== "string") {
    issues.push({ field: path, message: "Hay una capa sin campo." });
    return null;
  }
  if (value.field === "permalink_qr") {
    rejectUnknown(value, QR_KEYS, path, issues);
    const x = numberInRange(value.x, 0, 1754);
    const y = numberInRange(value.y, 0, 1240);
    const size = numberInRange(value.size, 40, 400);
    if (x === null) {
      issues.push({ field: `${path}.x`, message: "tiene que estar dentro del lienzo." });
    }
    if (y === null) {
      issues.push({ field: `${path}.y`, message: "tiene que estar dentro del lienzo." });
    }
    if (size === null) {
      issues.push({ field: `${path}.size`, message: "tiene que estar entre 40 y 400." });
    }
    if (x === null || y === null || size === null) {
      return null;
    }
    return { field: "permalink_qr", x, y, size };
  }
  rejectUnknown(value, TEXT_KEYS, path, issues);
  if (!isTextField(value.field)) {
    issues.push({ field: `${path}.field`, message: `El campo ${value.field} no está en el catálogo.` });
    return null;
  }
  if (isLegalField(value.field) && !allowLegal) {
    issues.push({ field: `${path}.field`, message: "Las capas legales son de la instancia AC3." });
    return null;
  }
  const x = numberInRange(value.x, 0, 1754);
  const y = numberInRange(value.y, 0, 1240);
  if (x === null) {
    issues.push({ field: `${path}.x`, message: "tiene que estar dentro del lienzo." });
  }
  if (y === null) {
    issues.push({ field: `${path}.y`, message: "tiene que estar dentro del lienzo." });
  }
  const fontFamily = isFontFamily(value.fontFamily) ? value.fontFamily : null;
  if (!fontFamily) {
    issues.push({ field: `${path}.fontFamily`, message: "la fuente no está instalada en el servidor." });
  }
  const fontSize = numberInRange(value.fontSize, 8, 200);
  if (fontSize === null) {
    issues.push({ field: `${path}.fontSize`, message: "tiene que estar entre 8 y 200." });
  }
  const align = value.align === "left" || value.align === "center" || value.align === "right" ? value.align : null;
  if (!align) {
    issues.push({ field: `${path}.align`, message: "tiene que ser left, center o right." });
  }
  const color = typeof value.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(value.color) ? value.color : null;
  if (!color) {
    issues.push({ field: `${path}.color`, message: "debe ser #RRGGBB." });
  }
  if (x === null || y === null || !fontFamily || fontSize === null || !align || !color) {
    return null;
  }
  return { field: value.field as TextLayer["field"], x, y, fontFamily, fontSize, align, color };
}

function numberInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function rejectUnknown(value: Record<string, unknown>, allowed: readonly string[], prefix: string, issues: TemplatePackageIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      issues.push({ field: prefix ? `${prefix}.${key}` : key, message: "la propiedad no está permitida." });
    }
  }
}

function rejectExternalStrings(value: unknown, prefix: string, issues: TemplatePackageIssue[]): void {
  if (typeof value === "string") {
    if (/https?:\/\//i.test(value) || value.includes("//") || value.includes("\\") || value.includes("..") || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
      issues.push({ field: prefix || "layout", message: "no se admiten URL ni rutas externas." });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectExternalStrings(item, `${prefix}[${index}]`, issues));
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      rejectExternalStrings(item, prefix ? `${prefix}.${key}` : key, issues);
    }
  }
}

function isTextField(field: string): field is TextField | TextLayer["field"] {
  return (TEXT_FIELDS as readonly string[]).includes(field) || isLegalField(field);
}

function isFontFamily(value: unknown): value is FontFamily {
  return typeof value === "string" && (FONT_FAMILIES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
