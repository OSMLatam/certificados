import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { badgeImageUrl, DEFAULT_BADGE_SVG } from "./default-badge";

describe("badge image", () => {
  it("uses an SVG when the instance has no logo", () => {
    assert.equal(badgeImageUrl("https://certificados.osm.lat", ""), "https://certificados.osm.lat/badges/default.svg");
    assert.match(DEFAULT_BADGE_SVG, /<svg\b/);
    assert.equal(badgeImageUrl("https://certificados.osm.lat/", "https://cdn.example/logo.svg"), "https://cdn.example/logo.svg");
  });
});
