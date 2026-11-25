import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastAdminMessage } from "./users.service";

describe("last administrator", () => {
  it("blocks removing the role or deactivating the only active administrator", () => {
    assert.equal(lastAdminMessage(0), "Tiene que quedar al menos un administrador activo.");
    assert.equal(lastAdminMessage(1), null);
  });
});
