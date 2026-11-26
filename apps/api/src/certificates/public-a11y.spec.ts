import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import puppeteer from "puppeteer-core";
import { aboutMain, publicDocument, type PublicChrome } from "./public-chrome";
import { helpPage } from "./help-page";
import { permalinkPage } from "./permalink-page";
import { privacyPage } from "./privacy-page";
import { searchPage } from "./search-page";

const require = createRequire(__filename);
const axePath = require.resolve("axe-core");

const chrome: PublicChrome = {
  siteName: "Certificados OSM Latam",
  footerText: "Comunidad OpenStreetMap Latam",
  creditEnabled: true,
  softwareName: "certificados",
  softwareRepoUrl: "https://github.com/OSMLatam/certificados",
  creditText: "",
};

const issued = {
  status: "issued",
  fullName: "Ada Lovelace",
  eventName: "Mapatón",
  roleLabel: "Asistente",
  eventDate: "2026-11-22",
  venueName: "Bogotá",
  issuer: "Certificados OSM Latam",
  issuedAt: "2026-11-23T15:00:00.000Z",
  checksumSha256: "a".repeat(64),
  documentMasked: "CC ******0010",
};

describe("public accessibility", () => {
  it("has no serious or critical axe violations and the search form reports an error from the keyboard", async () => {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--disable-dev-shm-usage", "--disable-gpu", ...(process.env.PUPPETEER_NO_SANDBOX === "true" ? ["--no-sandbox", "--disable-setuid-sandbox"] : [])],
    });
    try {
      const pages = {
        search: searchPage(chrome),
        privacy: privacyPage("<h1>Aviso de tratamiento de datos</h1><ul><li><strong>Responsable:</strong> Certificados OSM Latam</li></ul>", chrome),
        about: publicDocument({ title: "Acerca de", chrome, main: aboutMain(chrome) }),
        help: helpPage(chrome, "https://certificados.osm.lat"),
      };
      assert.match(pages.search, /¿No encuentras tu certificado\? Mira la ayuda/);
      assert.match(pages.search, /Aún no generado/);
      assert.match(pages.search, /se genera al abrir el enlace/);
      assert.match(pages.help, /href="\/help">Ayuda/);
      assert.equal(pages.search.includes("Pendiente"), false);
      for (const [name, html] of Object.entries(pages)) {
        const violations = await runAxe(browser, html);
        assert.deepEqual(violations, [], name);
      }

      const page = await browser.newPage();
      await page.setContent(pages.search, { waitUntil: "domcontentloaded" });
      await page.addScriptTag({
        content: `window.fetch = async () => new Response(${JSON.stringify(JSON.stringify({ details: [{ field: "email", message: "Escribe un correo o un documento." }] }))}, { status: 400, headers: { "content-type": "application/json" } });`,
      });
      await page.focus("#email");
      await page.keyboard.press("Tab");
      await page.keyboard.down("Shift");
      await page.keyboard.press("Tab");
      await page.keyboard.up("Shift");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.getElementById("estado")?.textContent === "Escribe un correo o un documento.");
      const linked = await page.$eval("#email", (input) => input.getAttribute("aria-describedby") === "estado" && input.getAttribute("aria-invalid") === "true");
      assert.equal(linked, true);
      const afterError = await axeViolations(page);
      assert.deepEqual(afterError, []);
      await page.close();

      const certificate = await runAxe(browser, permalinkPage("abcdEFGH1234", chrome, "org@osm.lat"), issued);
      assert.deepEqual(certificate, []);
      const shown = await showCertificate(browser, permalinkPage("abcdEFGH1234", chrome, "org@osm.lat"));
      assert.match(shown, /Estado: Válido/);
      assert.match(shown, /Ada Lovelace/);
      assert.match(shown, /Descargar certificado/);
      assert.match(shown, /a{64}/);
      assert.match(shown, /CC \*{6}0010/);
      assert.equal(shown.includes("1234560010"), false);

      const revokedHtml = withFetch(
        permalinkPage("abcdEFGH1234", chrome, "org@osm.lat"),
        {
          status: "revoked",
          fullName: "Ada Lovelace",
          revokeReason: "nombre mal escrito",
          revokedAt: "2026-11-25T15:00:00.000Z",
        },
        200,
      );
      const revokedPage = await browser.newPage();
      await revokedPage.setContent(revokedHtml, { waitUntil: "domcontentloaded" });
      await revokedPage.waitForFunction(() => document.body.innerText.includes("Revocado el"));
      const revokedText = await revokedPage.evaluate(() => document.body.innerText);
      assert.match(revokedText, /Estado: Revocado/);
      assert.match(revokedText, /Revocado el 25\/11\/2026/);
      assert.match(revokedText, /Si crees que es un error, escribe a org@osm\.lat/);
      assert.equal(revokedText.includes("nombre mal escrito"), false);
      assert.equal(revokedText.includes("Ada Lovelace"), false);
      const revokedAxe = await axeViolations(revokedPage);
      assert.deepEqual(revokedAxe, []);
      await revokedPage.close();
    } finally {
      await browser.close();
    }
  });
});

async function runAxe(browser: puppeteer.Browser, html: string, fixture?: unknown): Promise<string[]> {
  const page = await browser.newPage();
  try {
    await page.setContent(fixture ? withFetch(html, fixture, 200) : html, { waitUntil: "domcontentloaded" });
    if (fixture) {
      await page.waitForFunction(() => document.body.innerText.includes("Estado: Válido"));
    }
    return await axeViolations(page);
  } finally {
    await page.close();
  }
}

async function showCertificate(browser: puppeteer.Browser, html: string): Promise<string> {
  const page = await browser.newPage();
  try {
    await page.setContent(withFetch(html, issued, 200), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.innerText.includes("Estado: Válido"));
    return page.evaluate(() => document.body.innerText);
  } finally {
    await page.close();
  }
}

function withFetch(html: string, payload: unknown, status: number): string {
  const stub = `<script>window.fetch = async () => new Response(${JSON.stringify(JSON.stringify(payload))}, { status: ${status}, headers: { "content-type": "application/json" } });</script>`;
  return html.replace("<body>", `<body>${stub}`);
}

async function axeViolations(page: puppeteer.Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const result = await window.axe.run(document);
    return result.violations
      .filter((item) => item.impact === "serious" || item.impact === "critical")
      .map((item) => `${item.impact ?? ""} ${item.id}: ${item.help}`);
  });
}

declare global {
  interface Window {
    axe: {
      run(context: Document): Promise<{ violations: { id: string; impact: string | null; help: string }[] }>;
    };
  }
}
