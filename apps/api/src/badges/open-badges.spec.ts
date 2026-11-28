import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertionDocument, badgeIdentity, issuerDocument, revocationsDocument } from "./open-badges";

const base = "https://certificados.osm.lat";

describe("open badges json", () => {
  it("builds a hosted assertion whose evidence points at the certificate", () => {
    const document = assertionDocument({
      baseUrl: base,
      uuid: "11111111-1111-4111-8111-111111111111",
      classId: "22222222-2222-4222-8222-222222222222",
      email: "ada@example.com",
      salt: "abc",
      fallbackId: "person",
      issuedOn: "2026-09-10T19:23:00.000Z",
      evidenceUrl: `${base}/c/abcdefghij12`,
      revoked: false,
      revocationReason: null,
    });
    assert.equal(document["@context"], "https://w3id.org/openbadges/v2");
    assert.equal(document.type, "Assertion");
    assert.equal(document.id, `${base}/badges/assertions/11111111-1111-4111-8111-111111111111.json`);
    const evidence = document.evidence as { id: string }[];
    assert.equal(evidence[0]?.id, `${base}/c/abcdefghij12`);
    const recipient = document.recipient as { hashed: boolean; identity: string };
    assert.equal(recipient.hashed, true);
    assert.equal(recipient.identity.startsWith("sha256$"), true);
  });

  it("keeps the same hash for the same salt and marks a revoked assertion", () => {
    const first = badgeIdentity("ada@example.com", "salt", "fallback");
    const second = badgeIdentity("ada@example.com", "salt", "fallback");
    assert.equal(first.identity, second.identity);
    const document = assertionDocument({
      baseUrl: base,
      uuid: "11111111-1111-4111-8111-111111111111",
      classId: "22222222-2222-4222-8222-222222222222",
      email: "ada@example.com",
      salt: "salt",
      fallbackId: "person",
      issuedOn: "2026-09-10T19:23:00.000Z",
      evidenceUrl: `${base}/c/abcdefghij12`,
      revoked: true,
      revocationReason: "duplicado",
    });
    assert.equal(document.revoked, true);
    assert.equal(document.revocationReason, "duplicado");
  });

  it("points the issuer revocation list at revocations.json", () => {
    const issuer = issuerDocument({ baseUrl: base, name: "Certificados OSM Latam", email: "org@osm.lat", description: "Emisor" });
    assert.equal(issuer.revocationList, `${base}/badges/revocations.json`);
    assert.equal(issuer.id, `${base}/badges/issuer.json`);
    const list = revocationsDocument({
      baseUrl: base,
      items: [{ uuid: "11111111-1111-4111-8111-111111111111", reason: "duplicado" }],
    });
    const revoked = list.revokedAssertions as { id: string }[];
    assert.equal(revoked[0]?.id, `${base}/badges/assertions/11111111-1111-4111-8111-111111111111.json`);
  });
});
