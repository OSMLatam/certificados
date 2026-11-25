import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accessMessage } from "./access-message";

describe("access message", () => {
  it("explains a missing role, a deactivated account, and a closed section", () => {
    assert.match(accessMessage({ osmUsername: "angoca81", contactEmail: "org@osm.lat", reason: "role" }), /angoca81/);
    assert.match(accessMessage({ osmUsername: "angoca81", contactEmail: "org@osm.lat", reason: "role" }), /org@osm.lat/);
    assert.match(accessMessage({ osmUsername: "angoca81", contactEmail: "", reason: "inactive" }), /desactivada/);
    assert.match(accessMessage({ osmUsername: "angoca81", contactEmail: "org@osm.lat", reason: "section" }), /esta sección/);
  });
});
