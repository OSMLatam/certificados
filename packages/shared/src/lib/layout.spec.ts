import { describe, expect, it } from "vitest";
import { layoutHasLegal, minimalCertificateLayout, parseCertificateLayout } from "./layout";

describe("parseCertificateLayout", () => {
  it("accepts the minimal landscape template", () => {
    const layout = minimalCertificateLayout();
    const parsed = parseCertificateLayout(layout);
    expect(parsed.ok).toBe(true);
    expect(layoutHasLegal(layout)).toBe(false);
  });

  it("rejects a portrait canvas and a field outside the catalog", () => {
    const layout = minimalCertificateLayout();
    const portrait = parseCertificateLayout({ ...layout, canvas: { ...layout.canvas, orientation: "portrait" } });
    expect(portrait.ok).toBe(false);
    const unknown = parseCertificateLayout({
      ...layout,
      layers: [{ field: "https://example.test", x: 1, y: 1 }],
    });
    expect(unknown.ok).toBe(false);
  });

  it("recognizes a legal layer", () => {
    const layout = minimalCertificateLayout();
    layout.layers.push({
      field: "legal.nit",
      x: 10,
      y: 10,
      fontFamily: "Liberation Sans",
      fontSize: 12,
      align: "left",
      color: "#111111",
    });
    expect(layoutHasLegal(layout)).toBe(true);
  });
});
