import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { minimalCertificateLayout } from "@certificados/shared";
import { renderCertificateHtml, type CertificateValues } from "./certificate-html";

const values: CertificateValues = {
  full_name: "Ada <Lovelace>",
  document: "CC 123",
  role_label: "Asistente",
  activity_title: "",
  event_name: "SOTM",
  venue_name: "Bogotá",
  event_date: "22 de noviembre de 2026",
  certificate_slug: "abcdefghij12",
  permalink: "https://certificados.osm.lat/c/abcdefghij12",
};

describe("renderCertificateHtml", () => {
  it("escapes text and keeps the hash out of the file", () => {
    const html = renderCertificateHtml({
      layout: minimalCertificateLayout(),
      values,
      qrSvg: "<svg></svg>",
      fontFaceCss: "",
    });
    assert.match(html, /Ada &lt;Lovelace&gt;/);
    assert.equal(html.includes("Ada <Lovelace>"), false);
    assert.equal(html.includes("http:"), false);
    assert.equal(html.includes("https:"), false);
    assert.equal(html.includes("checksum"), false);
    const withLink = renderCertificateHtml({
      layout: {
        ...minimalCertificateLayout(),
        layers: [
          ...minimalCertificateLayout().layers,
          { field: "certificate_slug", x: 80, y: 180, fontFamily: "Liberation Sans", fontSize: 16, align: "left", color: "#1a1a1a" },
          { field: "permalink", x: 80, y: 220, fontFamily: "Liberation Sans", fontSize: 16, align: "left", color: "#1a1a1a" },
        ],
      },
      values,
      qrSvg: "<svg></svg>",
      fontFaceCss: "",
    });
    assert.match(withLink, /abcdefghij12/);
    assert.match(withLink, /https:\/\/certificados\.osm\.lat\/c\/abcdefghij12/);
    const withBackground = renderCertificateHtml({
      layout: minimalCertificateLayout(),
      values,
      qrSvg: "<svg></svg>",
      fontFaceCss: "",
      backgroundDataUri: "data:image/png;base64,aaaa",
    });
    assert.match(withBackground, /data:image\/png;base64,aaaa/);
    const rejected = renderCertificateHtml({
      layout: minimalCertificateLayout(),
      values,
      qrSvg: "<svg></svg>",
      fontFaceCss: "",
      backgroundDataUri: "https://example.test/fondo.png",
    });
    assert.equal(rejected.includes("example.test"), false);
  });
});
