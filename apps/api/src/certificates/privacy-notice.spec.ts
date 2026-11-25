import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadPrivacyNotice, renderPrivacyMarkdown, resolveNoticeFile } from "./privacy-notice";

describe("privacy notice", () => {
  it("escapes markup and fills the instance name, the contact email, and the page link", () => {
    const html = renderPrivacyMarkdown(
      "<!-- nota interna -->\n# Aviso\n- **Responsable:** {{SITE_NAME}}\n<script>alert(1)</script>\n- Escribir a {{PRIVACY_CONTACT_EMAIL}}\n- {{PRIVACY_PATH}}\n",
      { siteName: "OSM <Latam>", contactEmail: "privacidad@example.org" },
    );
    assert.match(html, /<h1>Aviso<\/h1>/);
    assert.match(html, /<strong>Responsable:<\/strong> OSM &lt;Latam&gt;/);
    assert.match(html, /mailto:privacidad@example.org/);
    assert.match(html, /href="\/privacy"/);
    assert.equal(html.includes("<script>"), false);
    assert.equal(html.includes("nota interna"), false);
    assert.match(renderPrivacyMarkdown("*Última actualización: 24 de noviembre de 2026*", { siteName: "OSM", contactEmail: "" }), /<em>Última actualización: 24 de noviembre de 2026<\/em>/);
    assert.equal(html.includes("no trata datos"), false);
  });

  it("renders the placeholder shipped with the repository", () => {
    const file = resolveNoticeFile("docs/anexos/privacy-notice.placeholder.md");
    const source = readFileSync(file, "utf8");
    const html = loadPrivacyNotice(file, { siteName: "Certificados OSM Latam", contactEmail: "privacidad@example.org" });
    assert.match(html, /Certificados OSM Latam/);
    assert.match(html, /privacidad@example.org/);
    assert.match(html, /href="\/privacy"/);
    assert.equal(/no trata datos/i.test(source + html), false);
    assert.equal(/consentimiento.{0,40}no aplica/i.test(html), false);
  });
});
