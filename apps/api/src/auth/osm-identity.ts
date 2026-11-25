export type PanelRole = "admin" | "editor" | null;

export function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Seed match forces admin. Anyone else keeps the role already stored (null until an admin assigns one). */
export function roleForLogin(input: {
  osmId: string;
  displayName: string;
  currentRole: PanelRole;
  seedIds: string[];
  seedNames: string[];
}): PanelRole {
  if (input.seedIds.includes(input.osmId) || input.seedNames.includes(input.displayName)) {
    return "admin";
  }
  return input.currentRole;
}

export function parseOsmUserXml(xml: string): { osmId: string; displayName: string } {
  const tag = xml.match(/<user\b([^>]*)\/?>/);
  if (!tag?.[1]) {
    throw new Error("OSM user element missing");
  }
  const id = tag[1].match(/\bid="(\d+)"/);
  const name = tag[1].match(/\bdisplay_name="([^"]*)"/);
  if (!id?.[1] || !name?.[1]) {
    throw new Error("OSM user attributes missing");
  }
  return { osmId: id[1], displayName: decodeXml(name[1]) };
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
