import { describe, expect, it } from "vitest";
import { minimalCertificateLayout } from "./layout";
import { buildTemplatePackage, parseTemplatePackage } from "./template-package";

const meta = {
  exportedAt: "2026-11-24T12:00:00.000Z",
  instance: "osm_lat" as const,
  sourceEventName: "Mapatón",
  roleCode: null,
};

describe("parseTemplatePackage", () => {
  it("round-trips a layout and ignores nothing from the package", () => {
    const layout = minimalCertificateLayout();
    const parsed = parseTemplatePackage(buildTemplatePackage(layout, meta), { allowLegal: false });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.layout).toEqual(layout);
    }
  });

  it("reports a bad color and an external URL with a field path", () => {
    const pack = buildTemplatePackage(minimalCertificateLayout(), meta);
    const layer = pack.layers[0];
    if (!layer || layer.field === "permalink_qr") {
      throw new Error("expected a text layer");
    }
    layer.color = "red";
    layer.fontFamily = "https://fonts.example/font.ttf" as typeof layer.fontFamily;
    const parsed = parseTemplatePackage(pack, { allowLegal: false });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues.some((issue) => issue.field === "layers[0].color" && issue.message === "debe ser #RRGGBB.")).toBe(true);
      expect(parsed.issues.some((issue) => issue.field === "layers[0].fontFamily" && issue.message === "no se admiten URL ni rutas externas.")).toBe(true);
    }
  });

  it("rejects legal layers outside AC3 and an unknown property", () => {
    const pack = buildTemplatePackage(minimalCertificateLayout(), meta);
    pack.layers.push({
      field: "legal.nit",
      x: 10,
      y: 10,
      fontFamily: "Liberation Sans",
      fontSize: 12,
      align: "left",
      color: "#111111",
    });
    (pack as { note?: string }).note = "extra";
    const parsed = parseTemplatePackage(pack, { allowLegal: false });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues.some((issue) => issue.field.endsWith(".field") && issue.message.includes("AC3"))).toBe(true);
      expect(parsed.issues.some((issue) => issue.field === "note")).toBe(true);
    }
  });
});
