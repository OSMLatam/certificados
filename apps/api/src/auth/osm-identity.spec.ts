import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOAuthState, verifyOAuthState } from "./oauth-state";
import { parseOsmUserXml, roleForLogin } from "./osm-identity";

describe("roleForLogin", () => {
  it("grants admin when the numeric id is in the seed", () => {
    assert.equal(
      roleForLogin({
        osmId: "21564944",
        displayName: "Otra persona",
        currentRole: null,
        seedIds: ["21564944"],
        seedNames: [],
      }),
      "admin",
    );
  });

  it("matches the display name with spaces, case-sensitive", () => {
    assert.equal(
      roleForLogin({
        osmId: "1",
        displayName: "Comunidad OpenStreetMap Colombia",
        currentRole: null,
        seedIds: [],
        seedNames: ["Comunidad OpenStreetMap Colombia"],
      }),
      "admin",
    );
    assert.equal(
      roleForLogin({
        osmId: "1",
        displayName: "comunidad openstreetmap colombia",
        currentRole: null,
        seedIds: [],
        seedNames: ["Comunidad OpenStreetMap Colombia"],
      }),
      null,
    );
  });

  it("keeps an existing editor when the account is not in the seed", () => {
    assert.equal(
      roleForLogin({
        osmId: "9",
        displayName: "Alguien",
        currentRole: "editor",
        seedIds: [],
        seedNames: [],
      }),
      "editor",
    );
  });
});

describe("parseOsmUserXml", () => {
  it("reads id and display name", () => {
    const xml =
      '<osm><user id="21564944" display_name="Comunidad OpenStreetMap Colombia" account_created="2024-05-22T23:55:15Z"></user></osm>';
    assert.deepEqual(parseOsmUserXml(xml), {
      osmId: "21564944",
      displayName: "Comunidad OpenStreetMap Colombia",
    });
  });
});

describe("oauth state", () => {
  it("accepts a fresh state and rejects a tampered one", () => {
    const secret = "test-secret-test-secret-test-secret";
    const state = createOAuthState(secret, 1_000);
    assert.equal(verifyOAuthState(secret, state, 1_000), true);
    assert.equal(verifyOAuthState(secret, `${state}x`, 1_000), false);
    assert.equal(verifyOAuthState("other-secret-other-secret-other", state, 1_000), false);
  });
});
