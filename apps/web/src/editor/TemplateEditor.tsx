import { useEffect, useRef, useState } from "react";
import { FormAlert } from "../admin/FormAlert";
import { CopySourceSelect } from "./CopySourceSelect";
import { rolesWithoutTemplate, templateLabel } from "./template-choice";
import type { TemplateSource } from "./template-sources";
import { failureFromBody } from "../admin/form-feedback";
import type Konva from "konva";
import { Image as KonvaImage, Layer, Rect, Stage, Text, Group } from "react-konva";

const CANVAS_WIDTH = 1754;
const CANVAS_HEIGHT = 1240;
const SCALE = 0.42;
const QR_MARGIN = 60;
const QR_SIZE = 150;

const FIELDS: { field: string; label: string; sample: string }[] = [
  { field: "full_name", label: "Nombre de la persona", sample: "Nombre del participante" },
  { field: "document", label: "Documento", sample: "CC 123456789" },
  { field: "role_label", label: "Rol", sample: "Asistente" },
  { field: "activity_title", label: "Actividad", sample: "Título de la actividad" },
  { field: "event_name", label: "Nombre del evento", sample: "Nombre del evento" },
  { field: "venue_name", label: "Sede", sample: "Sede" },
  { field: "event_date", label: "Fecha del evento", sample: "" },
  { field: "certificate_slug", label: "Enlace", sample: "https://certificados.osm.lat/c/C3FnrWz1n7V4" },
  { field: "permalink", label: "Enlace completo", sample: "https://certificados.osm.lat/c/C3FnrWz1n7V4" },
  { field: "permalink_qr", label: "Código QR", sample: "QR" },
];

const FONTS = ["Liberation Sans", "Liberation Sans Bold", "Noto Sans", "Noto Sans Bold"];

type TextLayer = {
  field: string;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  align: "left" | "center" | "right";
  color: string;
};

type QrLayer = { field: "permalink_qr"; x: number; y: number; size: number };
type LayoutLayer = TextLayer | QrLayer;

type Layout = {
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

type TemplateRecord = {
  id: string;
  name: string;
  roleCode: string | null;
  hasBackground: boolean;
  isDefault: boolean;
  layout: Layout;
};

type Pending =
  | { kind: "import"; file: File }
  | { kind: "copy"; sourceTemplateId: string };

export function TemplateEditor({ eventId }: { eventId: string }) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [newRole, setNewRole] = useState("");
  const [template, setTemplate] = useState<TemplateRecord | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [baseline, setBaseline] = useState<Layout | null>(null);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState("Cargando la plantilla…");
  const [error, setError] = useState<unknown>(null);
  const [background, setBackground] = useState<HTMLImageElement | null>(null);
  const [previewBackground, setPreviewBackground] = useState<HTMLImageElement | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [legalFields, setLegalFields] = useState<{ field: string; label: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadTemplates(eventId).then(
      (loaded) => {
        setTemplates(loaded.items);
        setRoles(loaded.roles);
        if (loaded.startDate) {
          setEventDate(formatEventDate(loaded.startDate));
        }
        const current = loaded.items.find((item) => item.isDefault) ?? loaded.items[0];
        if (current) {
          openTemplate(current);
        }
      },
      (reason: unknown) => setError(reason),
    );
  }, [eventId]);

  useEffect(() => {
    void fetch("/api/v1/admin/auth/me", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { instance?: string };
      })
      .then(async (me) => {
        if (me?.instance !== "ac3") return;
        const response = await fetch("/api/v1/admin/instance/legal", { credentials: "include" });
        const legal = response.ok ? ((await response.json()) as { signers?: { slot: number }[] }) : { signers: [] };
        const signers = (legal.signers ?? []).map((signer) => ({
          field: `legal.signer.${signer.slot}.name`,
          label: `Firmante ${signer.slot}`,
        }));
        setLegalFields([
          { field: "legal.entity_name", label: "Entidad" },
          { field: "legal.nit", label: "NIT" },
          { field: "legal.representative", label: "Representante" },
          { field: "legal.folio", label: "Folio" },
          { field: "legal.issue_city", label: "Ciudad de expedición" },
          { field: "legal.issue_date", label: "Fecha de expedición" },
          { field: "legal.disclaimer", label: "Aviso legal" },
          ...signers,
        ]);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!template?.hasBackground || pending) {
      if (!template?.hasBackground) {
        setBackground(null);
      }
      return;
    }
    return loadImage(`/api/v1/admin/events/${eventId}/templates/${template.id}/background`, setBackground, setError);
  }, [eventId, template, pending]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        const next = document.getElementById("layer-x") ?? document.querySelector(".panel button");
        if (next instanceof HTMLElement) {
          next.focus();
        }
        return;
      }
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || !layout || pending) {
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      const delta =
        event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowUp" ? [0, -step] : event.key === "ArrowDown" ? [0, step] : null;
      if (!delta) {
        return;
      }
      event.preventDefault();
      moveLayer(selected, delta[0], delta[1]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function moveLayer(index: number, dx: number, dy: number) {
    setLayout((current) => {
      if (!current) {
        return current;
      }
      const layers = current.layers.map((layer, layerIndex) =>
        layerIndex === index ? { ...layer, x: clamp(layer.x + dx), y: clamp(layer.y + dy, CANVAS_HEIGHT) } : layer,
      );
      return { ...current, layers };
    });
  }

  function patchLayer(index: number, patch: Partial<LayoutLayer>) {
    setLayout((current) => {
      if (!current) {
        return current;
      }
      const layers = current.layers.map((layer, layerIndex) => (layerIndex === index ? ({ ...layer, ...patch } as LayoutLayer) : layer));
      return { ...current, layers };
    });
  }

  function addField(field: string) {
    if (!layout || layout.layers.some((layer) => layer.field === field)) {
      return;
    }
    const layer: LayoutLayer =
      field === "permalink_qr"
        ? { field: "permalink_qr", x: QR_MARGIN, y: CANVAS_HEIGHT - QR_SIZE - QR_MARGIN, size: QR_SIZE }
        : { field, x: 877, y: 400, fontFamily: "Liberation Sans", fontSize: 32, align: "center", color: "#1a1a1a" };
    setSelected(layout.layers.length);
    setLayout({ ...layout, layers: [...layout.layers, layer] });
  }

  function removeSelected() {
    if (!layout || layout.layers.length < 2) {
      return;
    }
    setSelected(0);
    setLayout({ ...layout, layers: layout.layers.filter((_, index) => index !== selected) });
  }

  async function save() {
    if (!template || !layout || pending) {
      return;
    }
    setError(null);
    setStatus("Guardando…");
    const response = await fetch(`/api/v1/admin/events/${eventId}/templates/${template.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ layout }),
    });
    if (!response.ok) {
      setError(failureFromBody(await response.json().catch(() => null), response.status));
      setStatus(template.name);
      return;
    }
    setBaseline(layout);
    setStatus("Plantilla guardada.");
  }

  async function upload(file: File) {
    if (!template || pending) {
      return;
    }
    setError(null);
    setStatus("Subiendo el fondo…");
    const response = await fetch(`/api/v1/admin/events/${eventId}/templates/${template.id}/background`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!response.ok) {
      setError(failureFromBody(await response.json().catch(() => null), response.status));
      setStatus(template.name);
      return;
    }
    const updated = (await response.json()) as TemplateRecord;
    setTemplate({ ...updated, layout: layout ?? updated.layout });
    setStatus("Fondo guardado.");
  }

  async function stageImport(file: File) {
    if (!template || !layout) {
      return;
    }
    setError(null);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(`/api/v1/admin/events/${eventId}/templates/${template.id}/import?preview=1`, {
      method: "POST",
      credentials: "include",
      body,
    });
    if (!response.ok) {
      setError(failureFromBody(await response.json().catch(() => null), response.status));
      return;
    }
    const preview = (await response.json()) as { layout: Layout; background: { mimeType: string; base64: string } | null };
    setBaseline(layout);
    setLayout(preview.layout);
    setPending({ kind: "import", file });
    setPreviewBackground(preview.background ? imageFromDataUrl(preview.background.mimeType, preview.background.base64) : null);
    setStatus("Vista previa. Confirma para guardar o cancela para descartar.");
  }

  async function stageCopy(source: TemplateSource) {
    if (!template || !layout) {
      return;
    }
    setError(null);
    const listed = await fetch(`/api/v1/admin/events/${source.eventId}/templates`, { credentials: "include" });
    if (!listed.ok) {
      setError(failureFromBody(await listed.json().catch(() => null), listed.status));
      return;
    }
    const body = (await listed.json()) as { items: TemplateRecord[] };
    const found = body.items.find((item) => item.id === source.templateId);
    if (!found) {
      setError("Esa plantilla ya no está disponible.");
      return;
    }
    setBaseline(layout);
    setLayout(found.layout);
    setPending({ kind: "copy", sourceTemplateId: source.templateId });
    if (source.hasBackground) {
      loadImage(`/api/v1/admin/events/${source.eventId}/templates/${source.templateId}/background`, setPreviewBackground, setError);
    } else {
      setPreviewBackground(null);
    }
    setStatus("Vista previa de la plantilla copiada. Confirma para guardar o cancela para descartar.");
  }

  async function confirmPending() {
    if (!template || !pending) {
      return;
    }
    setError(null);
    const response =
      pending.kind === "import"
        ? await fetch(`/api/v1/admin/events/${eventId}/templates/${template.id}/import`, {
            method: "POST",
            credentials: "include",
            body: fileBody(pending.file),
          })
        : await fetch(`/api/v1/admin/events/${eventId}/templates/${template.id}/copy-from`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sourceTemplateId: pending.sourceTemplateId }),
          });
    if (!response.ok) {
      setError(failureFromBody(await response.json().catch(() => null), response.status));
      return;
    }
    const updated = (await response.json()) as TemplateRecord;
    setTemplate(updated);
    setLayout(updated.layout);
    setBaseline(updated.layout);
    setPending(null);
    setPreviewBackground(null);
    setStatus("Plantilla guardada.");
  }

  function cancelPending() {
    setLayout(baseline);
    setPending(null);
    setPreviewBackground(null);
    setStatus(template?.name ?? "Plantilla");
  }

  function openTemplate(record: TemplateRecord): void {
    setTemplate(record);
    setLayout(record.layout);
    setBaseline(record.layout);
    setSelected(0);
    setPending(null);
    setPreviewBackground(null);
    setStatus(templateLabel(record));
  }

  async function createRoleTemplate(roleCode: string): Promise<void> {
    setError(null);
    const response = await fetch(`/api/v1/admin/events/${eventId}/templates`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: roleCode, roleCode }),
    });
    if (!response.ok) {
      setError(failureFromBody(await response.json().catch(() => null), response.status));
      return;
    }
    const created = (await response.json()) as TemplateRecord;
    setTemplates((current) => [...current, created]);
    setNewRole("");
    openTemplate(created);
  }

  const current = layout?.layers[selected];
  const currentLabel =
    FIELDS.find((field) => field.field === current?.field)?.label ??
    legalFields.find((field) => field.field === current?.field)?.label ??
    "capa";

  return (
    <div className="editor">
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <aside className="panel" id="contenido">
        <h1>Plantilla</h1>
        <p>
          <a href={`/admin/events/${eventId}`}>Volver al evento</a>
        </p>
        <p className="status" role="status">
          {status}
        </p>
        <FormAlert error={error} />
        <label htmlFor="template-choice">Plantilla</label>
        <select
          id="template-choice"
          value={template?.id ?? ""}
          onChange={(event) => {
            const next = templates.find((item) => item.id === event.target.value);
            if (!next || next.id === template?.id) {
              return;
            }
            const dirty = JSON.stringify(layout) !== JSON.stringify(baseline);
            if (dirty && !window.confirm("Hay cambios sin guardar. ¿Cambias de plantilla?")) {
              return;
            }
            openTemplate(next);
          }}
        >
          {templates.map((item) => (
            <option key={item.id} value={item.id}>
              {templateLabel(item)}
            </option>
          ))}
        </select>
        {rolesWithoutTemplate(roles, templates).length > 0 ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (newRole) {
                void createRoleTemplate(newRole);
              }
            }}
          >
            <label htmlFor="template-role">Nueva plantilla para el rol</label>
            <select id="template-role" value={newRole} onChange={(event) => setNewRole(event.target.value)} required>
              <option value="">Elige un rol</option>
              {rolesWithoutTemplate(roles, templates).map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button type="submit">Crear plantilla del rol</button>
          </form>
        ) : null}
        <p>Arrastra cada texto. Las flechas del teclado lo mueven un píxel. Escape vuelve a los campos.</p>
        <p>El enlace imprime la dirección completa del certificado, por ejemplo https://certificados.osm.lat/c/C3FnrWz1n7V4. El código QR abre esa misma dirección.</p>
        <p>
          <button type="button" onClick={() => setStatus("Vista previa con datos de ejemplo. El folio y la fecha de expedición salen como —.")}>
            Vista previa
          </button>
        </p>
        <div className="fields">
          {FIELDS.map((field) => {
            const present = layout?.layers.some((layer) => layer.field === field.field) ?? false;
            return (
              <button key={field.field} type="button" disabled={present || pending !== null} onClick={() => addField(field.field)}>
                {present ? `${field.label} ya está en la plantilla` : `Agregar campo: ${field.label}`}
              </button>
            );
          })}
          {legalFields.map((field) => {
            const present = layout?.layers.some((layer) => layer.field === field.field) ?? false;
            return (
              <button key={field.field} type="button" disabled={present || pending !== null} onClick={() => addField(field.field)}>
                {present ? `${field.label} ya está en la plantilla` : `Agregar campo: ${field.label}`}
              </button>
            );
          })}
        </div>
        {current ? (
          <div className="coords">
            <p>
              Capa seleccionada: <strong>{currentLabel}</strong>
            </p>
            <label htmlFor="layer-x">X</label>
            <input id="layer-x" type="number" value={Math.round(current.x)} onChange={(event) => patchLayer(selected, { x: clamp(Number(event.target.value)) })} />
            <label htmlFor="layer-y">Y</label>
            <input
              id="layer-y"
              type="number"
              value={Math.round(current.y)}
              onChange={(event) => patchLayer(selected, { y: clamp(Number(event.target.value), CANVAS_HEIGHT) })}
            />
            {isQr(current) ? (
              <>
                <label htmlFor="layer-size">Tamaño del QR</label>
                <input
                  id="layer-size"
                  type="number"
                  min={40}
                  max={400}
                  value={current.size}
                  onChange={(event) => patchLayer(selected, { size: clamp(Number(event.target.value), 400) })}
                />
              </>
            ) : (
              <>
                <label htmlFor="layer-font-size">Tamaño de letra</label>
                <input
                  id="layer-font-size"
                  type="number"
                  min={8}
                  max={200}
                  value={current.fontSize}
                  onChange={(event) => patchLayer(selected, { fontSize: clamp(Number(event.target.value), 200) })}
                />
                <label htmlFor="layer-color">Color</label>
                <input id="layer-color" type="color" value={current.color} onChange={(event) => patchLayer(selected, { color: event.target.value })} />
                <label htmlFor="layer-align">Alineación</label>
                <select id="layer-align" value={current.align} onChange={(event) => patchLayer(selected, { align: event.target.value as TextLayer["align"] })}>
                  <option value="left">Izquierda</option>
                  <option value="center">Centro</option>
                  <option value="right">Derecha</option>
                </select>
                <label htmlFor="layer-bold">
                  <input
                    id="layer-bold"
                    type="checkbox"
                    checked={current.fontFamily.endsWith("Bold")}
                    onChange={(event) => patchLayer(selected, { fontFamily: withBold(current.fontFamily, event.target.checked) })}
                  />
                  Negrita
                </label>
              </>
            )}
          </div>
        ) : null}
        <div className="actions">
          <button type="button" onClick={removeSelected} disabled={pending !== null}>
            Quitar {currentLabel}
          </button>
          <button type="button" className="primary" onClick={() => void save()} disabled={pending !== null}>
            Guardar
          </button>
        </div>
        <label htmlFor="background">Fondo PNG o JPEG</label>
        <input
          id="background"
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void upload(file);
            }
            event.target.value = "";
          }}
        />
        {template ? (
          <p>
            <a href={`/api/v1/admin/events/${eventId}/templates/${template.id}/export`}>Exportar plantilla</a>
          </p>
        ) : null}
        <label htmlFor="import-template">Importar plantilla</label>
        <input
          id="import-template"
          ref={importRef}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void stageImport(file);
            }
            event.target.value = "";
          }}
        />
        <label htmlFor="copy-template">Copiar de otro evento</label>
        <CopySourceSelect
          eventId={eventId}
          templateId={template?.id ?? null}
          disabled={pending !== null || !template}
          onChoose={(source) => void stageCopy(source)}
        />
        {pending ? (
          <div className="actions">
            <button type="button" className="primary" onClick={() => void confirmPending()}>
              Confirmar
            </button>
            <button type="button" onClick={cancelPending}>
              Cancelar
            </button>
          </div>
        ) : null}
      </aside>
      <div className="stage-wrap" tabIndex={0} aria-label="Lienzo de la plantilla. Escape vuelve a los campos.">
        {layout ? (
          <Stage width={CANVAS_WIDTH * SCALE} height={CANVAS_HEIGHT * SCALE} scaleX={SCALE} scaleY={SCALE}>
            <Layer>
              <Rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#ffffff" />
              {shownBackground(previewBackground, background) ? (
                <KonvaImage image={shownBackground(previewBackground, background)!} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
              ) : null}
              {layout.layers.map((layer, index) => (
                <EditorLayer
                  key={`${layer.field}-${index}`}
                  layer={layer}
                  label={FIELDS.find((field) => field.field === layer.field)?.label ?? layer.field}
                  sample={sampleFor(layer.field, eventDate)}
                  selected={index === selected}
                  onSelect={() => setSelected(index)}
                  onMove={(x, y) => patchLayer(index, { x, y })}
                />
              ))}
            </Layer>
          </Stage>
        ) : null}
      </div>
    </div>
  );
}

function EditorLayer({
  layer,
  label,
  sample,
  selected,
  onSelect,
  onMove,
}: {
  layer: LayoutLayer;
  label: string;
  sample: string;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const textRef = useRef<Konva.Text>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    setWidth(textRef.current?.width() ?? 0);
  }, [sample, layer]);

  if (isQr(layer)) {
    return (
      <Group x={layer.x} y={layer.y} draggable onClick={onSelect} onTap={onSelect} onDragEnd={(event) => onMove(event.target.x(), event.target.y())}>
        <Rect width={layer.size} height={layer.size} stroke={selected ? "#0b3d0b" : "#666666"} strokeWidth={selected ? 6 : 2} dash={selected ? undefined : [12, 8]} />
        {selected ? <Text text={label} y={-28} fontSize={22} fill="#0b3d0b" /> : null}
        <Text text="QR" fontSize={28} x={12} y={12} />
      </Group>
    );
  }
  const offsetX = layer.align === "center" ? width / 2 : layer.align === "right" ? width : 0;
  const bold = layer.fontFamily.endsWith("Bold");
  return (
    <Group x={layer.x} y={layer.y} draggable onClick={onSelect} onTap={onSelect} onDragEnd={(event) => onMove(event.target.x(), event.target.y())}>
      {selected ? <Rect x={-offsetX - 8} y={-8} width={Math.max(width, 40) + 16} height={layer.fontSize + 16} stroke="#0b3d0b" strokeWidth={4} /> : null}
      {selected ? <Text text={label} x={-offsetX} y={-32} fontSize={22} fill="#0b3d0b" /> : null}
      <Text
        ref={textRef}
        text={sample}
        offsetX={offsetX}
        fontSize={layer.fontSize}
        fontFamily="Liberation Sans, Noto Sans, sans-serif"
        fontStyle={bold ? "bold" : "normal"}
        fill={layer.color}
      />
    </Group>
  );
}

function shownBackground(preview: HTMLImageElement | null, saved: HTMLImageElement | null): HTMLImageElement | null {
  return preview ?? saved;
}

function sampleFor(field: string, eventDate: string): string {
  if (field === "event_date") {
    return eventDate || "fecha del evento";
  }
  if (field === "legal.folio" || field === "legal.issue_date") {
    return "—";
  }
  if (field === "legal.nit") return "900.000.000-0";
  if (field === "legal.entity_name") return "Entidad de ejemplo";
  if (field.startsWith("legal.signer.")) return "Nombre del firmante";
  return FIELDS.find((item) => item.field === field)?.sample || field;
}

function formatEventDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  if (!year || !month || !day || !months[month - 1]) {
    return value;
  }
  return `${day} de ${months[month - 1]} de ${year}`;
}

function withBold(family: string, bold: boolean): string {
  const base = family.replace(/ Bold$/, "");
  const next = bold ? `${base} Bold` : base;
  return FONTS.includes(next) ? next : family;
}

function fileBody(file: File): FormData {
  const body = new FormData();
  body.set("file", file);
  return body;
}

function imageFromDataUrl(mimeType: string, value: string): HTMLImageElement {
  const image = new window.Image();
  image.src = `data:${mimeType};base64,${value}`;
  return image;
}

function loadImage(url: string, assign: (image: HTMLImageElement | null) => void, report: (message: string) => void): () => void {
  let cancelled = false;
  let objectUrl = "";
  void fetch(url, { credentials: "include" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("No se pudo leer el fondo.");
      }
      return response.blob();
    })
    .then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      const image = new window.Image();
      image.onload = () => {
        if (!cancelled) {
          assign(image);
        }
      };
      image.src = objectUrl;
    })
    .catch((reason: unknown) => {
      if (!cancelled) {
        report(reason instanceof Error ? reason.message : "No se pudo leer el fondo.");
      }
    });
  return () => {
    cancelled = true;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  };
}

async function loadTemplates(eventId: string): Promise<{ items: TemplateRecord[]; roles: string[]; startDate: string }> {
  const listed = await fetch(`/api/v1/admin/events/${eventId}/templates`, { credentials: "include" });
  if (listed.status === 401 || listed.status === 403) {
    throw new Error("Tu sesión no tiene acceso al panel.");
  }
  if (!listed.ok) {
    throw failureFromBody(await listed.json().catch(() => null), listed.status);
  }
  const body = (await listed.json()) as { items: TemplateRecord[] };
  const eventResponse = await fetch(`/api/v1/admin/events/${eventId}`, { credentials: "include" });
  const event = eventResponse.ok
    ? ((await eventResponse.json()) as { allowedRoles?: string[]; startDate?: string })
    : {};
  const items = [...body.items];
  if (items.length === 0) {
    const created = await fetch(`/api/v1/admin/events/${eventId}/templates`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "General" }),
    });
    if (!created.ok) {
      throw failureFromBody(await created.json().catch(() => null), created.status);
    }
    items.push((await created.json()) as TemplateRecord);
  }
  return { items, roles: event.allowedRoles ?? [], startDate: event.startDate ?? "" };
}

function isQr(layer: LayoutLayer): layer is QrLayer {
  return layer.field === "permalink_qr" && "size" in layer;
}

function clamp(value: number, max = CANVAS_WIDTH): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(max, Math.max(0, value));
}
