import { describe, expect, it } from "vitest";
import { parsePregeneratedCsv, pregeneratedCsvTemplate } from "./parse-pregenerated";

describe("parsePregeneratedCsv", () => {
  it("reads the downloadable template", () => {
    const parsed = parsePregeneratedCsv(pregeneratedCsvTemplate());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ filename: "cert-ana-asistente.pdf", role: "asistente" });
    expect(parsed.rows[1]).toMatchObject({ filename: "cert-carlos-ponente.pdf", activityTitle: "Mapping con OpenStreetMap" });
  });

  it("rejects a sheet that is not separated by semicolons", () => {
    const parsed = parsePregeneratedCsv("filename,full_name,email,role\n");
    expect(parsed.ok).toBe(false);
  });
});
