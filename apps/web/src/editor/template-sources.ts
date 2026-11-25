export type TemplateSource = {
  eventId: string;
  eventName: string;
  year: number;
  templateId: string;
  name: string;
  roleCode: string | null;
  hasBackground: boolean;
};

export function templateSourceLabel(source: Pick<TemplateSource, "eventName" | "year" | "name" | "roleCode">): string {
  return `${source.eventName} (${source.year}) · ${source.name} (${source.roleCode ?? "general"})`;
}

export function templateSourceChoices(sources: readonly TemplateSource[], current: { eventId: string; templateId: string | null }): TemplateSource[] {
  return sources.filter((source) => source.eventId !== current.eventId && source.templateId !== current.templateId);
}
