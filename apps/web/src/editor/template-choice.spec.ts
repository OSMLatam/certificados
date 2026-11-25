import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rolesWithoutTemplate, templateLabel } from "./template-choice";

describe("template choice", () => {
  it("offers only roles that do not have a template yet", () => {
    assert.deepEqual(
      rolesWithoutTemplate(["asistente", "ponente"], [{ roleCode: null }, { roleCode: "asistente" }]),
      ["ponente"],
    );
    assert.equal(templateLabel({ name: "General", roleCode: null }), "General (general)");
    assert.equal(templateLabel({ name: "Ponentes", roleCode: "ponente" }), "Ponentes (ponente)");
  });
});
