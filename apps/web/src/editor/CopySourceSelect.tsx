import { useEffect, useState } from "react";
import { templateSourceChoices, templateSourceLabel, type TemplateSource } from "./template-sources";

export function CopySourceSelect({
  eventId,
  templateId,
  disabled,
  onChoose,
}: {
  eventId: string;
  templateId: string | null;
  disabled: boolean;
  onChoose: (source: TemplateSource) => void;
}) {
  const [sources, setSources] = useState<TemplateSource[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/admin/template-sources", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("No se pudieron cargar las plantillas.");
        }
        return (await response.json()) as { items?: TemplateSource[] };
      })
      .then((body) => {
        if (!cancelled) {
          setSources(templateSourceChoices(body.items ?? [], { eventId, templateId }));
        }
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, templateId]);

  return (
    <select
      id="copy-template"
      defaultValue=""
      disabled={disabled}
      onChange={(event) => {
        const chosen = sources.find((source) => source.templateId === event.target.value);
        event.target.value = "";
        if (chosen) onChoose(chosen);
      }}
    >
      <option value="">Elige una plantilla</option>
      {sources.map((source) => (
        <option key={source.templateId} value={source.templateId}>
          {templateSourceLabel(source)}
        </option>
      ))}
    </select>
  );
}
