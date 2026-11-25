import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aboutMain, publicDocument, softwareCredit, type PublicChrome } from "./public-chrome";

const chrome: PublicChrome = {
  siteName: "Certificados OSM Latam",
  footerText: "Comunidad OpenStreetMap Latam",
  creditEnabled: true,
  softwareName: "certificados",
  softwareRepoUrl: "https://github.com/OSMLatam/certificados",
  creditText: "",
};

describe("public chrome", () => {
  it("credits the software and says this site is an independent deployment", () => {
    const about = publicDocument({ title: "Acerca de", chrome, main: aboutMain(chrome) });
    assert.match(about, /despliegue independiente/);
    assert.match(about, /licencia MIT/);
    assert.match(about, /https:\/\/github.com\/OSMLatam\/certificados/);
    assert.match(about, /Saltar al contenido/);
    assert.match(softwareCredit(chrome), /Software libre — <a href="https:\/\/github.com\/OSMLatam\/certificados">certificados<\/a> \(MIT\)/);
    assert.equal(softwareCredit({ ...chrome, creditEnabled: false }), "");
  });
});
