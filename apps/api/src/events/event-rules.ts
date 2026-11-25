export type EventStatusName = "draft" | "active";

export function activationBlocked(input: {
  status: EventStatusName;
  pregeneratedOnly: boolean;
  defaultTemplateId: string | null;
}): boolean {
  return input.status === "active" && !input.pregeneratedOnly && input.defaultTemplateId === null;
}

export function resolveVenueId(input: {
  venueCode: string | undefined;
  venues: { id: string; code: string }[];
}): { venueId: string | null } | { error: "unknown" } {
  const code = input.venueCode?.trim();
  if (!code) {
    if (input.venues.length === 1) {
      return { venueId: input.venues[0]!.id };
    }
    return { venueId: null };
  }
  const match = input.venues.find((venue) => venue.code === code);
  if (!match) {
    return { error: "unknown" };
  }
  return { venueId: match.id };
}

export function resolveCertificateTemplate(input: {
  pregeneratedOnly: boolean;
  defaultTemplateId: string | null;
  roleTemplateId: string | null;
}): { mode: "generated" | "pregenerated"; templateId: string | null } | { error: "missing" } {
  if (input.pregeneratedOnly) {
    return { mode: "pregenerated", templateId: null };
  }
  const templateId = input.roleTemplateId ?? input.defaultTemplateId;
  if (!templateId) {
    return { error: "missing" };
  }
  return { mode: "generated", templateId };
}
