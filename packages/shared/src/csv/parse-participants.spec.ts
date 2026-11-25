import { describe, expect, it } from "vitest";
import { parseParticipantCsv, participantCsvTemplate } from "./parse-participants";

describe("parseParticipantCsv", () => {
  it("reads the downloadable template, including the byte order mark", () => {
    const parsed = parseParticipantCsv(participantCsvTemplate());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[0]).toMatchObject({ row: 2, fullName: "Ana García", role: "asistente" });
    expect(parsed.rows[2]).toMatchObject({ activityTitle: "Mapping con OpenStreetMap", venueCode: "BOG" });
    expect(participantCsvTemplate()).toContain("@example.org");
    expect(participantCsvTemplate()).not.toContain("@mail.com");
  });

  it("keeps a semicolon that sits inside quotes", () => {
    const parsed = parseParticipantCsv(
      `${"full_name;email;country_code;doc_type;doc_number;role;activity_title;venue_code"}\n"Ada; Lovelace";ada@example.org;;;;;asistente;\n`,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.rows[0]?.fullName).toBe("Ada; Lovelace");
    }
  });

  it("rejects a comma-separated header and an unclosed quote", () => {
    const commas = parseParticipantCsv("full_name,email,role\nAda,ada@example.org,asistente\n");
    expect(commas.ok).toBe(false);
    if (!commas.ok) {
      expect(commas.issues.some((issue) => issue.field === "full_name")).toBe(true);
    }
    const open = parseParticipantCsv(
      "full_name;email;country_code;doc_type;doc_number;role;activity_title;venue_code\n\"Ada;ada@example.org;;;;;;\n",
    );
    expect(open.ok).toBe(false);
  });
});
