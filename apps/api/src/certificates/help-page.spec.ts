import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { helpPage } from "./help-page";
import type { PublicChrome } from "./public-chrome";

const chrome: PublicChrome = {
  siteName: "Certificados OSM Latam",
  footerText: "Comunidad OpenStreetMap Latam",
  creditEnabled: true,
  softwareName: "certificados",
  softwareRepoUrl: "https://github.com/OSMLatam/certificados",
  creditText: "",
};

describe("help page", () => {
  it("uses the instance address in the example and links the footer", () => {
    const html = helpPage(chrome, "https://certificados.example/");
    assert.match(html, /<h1>Ayuda<\/h1>/);
    assert.match(html, /<code>https:\/\/certificados\.example\/c\/AbC123xyZ<\/code>/);
    assert.equal(html.includes("certificados.osm.lat"), false);
    assert.match(html, /<a href="\/">Buscar certificados<\/a>/);
    assert.match(html, /<a href="\/privacy">Datos personales<\/a>/);
    assert.match(html, /<a href="\/help">Ayuda<\/a>/);
    assert.match(html, /Saltar al contenido/);
    assert.equal(html.includes("<script"), false);
  });
});
