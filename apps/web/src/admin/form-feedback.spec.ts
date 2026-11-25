import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { failureFromBody, formatDetail } from "./form-feedback";

describe("form feedback", () => {
  it("lists every CSV row and keeps a single field error as one sentence", () => {
    const many = failureFromBody(
      {
        message: "Validation failed",
        details: [
          { field: "role", message: "Ese rol no está permitido en el evento.", row: 2, value: "ponente" },
          { field: "email", message: "El correo no es válido.", row: 4, value: "ada" },
        ],
      },
      400,
    );
    assert.equal(many.message, "No se guardó ningún cambio.");
    assert.deepEqual(many.details.map(formatDetail), [
      "Fila 2, role: Ese rol no está permitido en el evento. (ponente)",
      "Fila 4, email: El correo no es válido. (ada)",
    ]);

    const one = failureFromBody({ message: "Validation failed", details: [{ field: "roles", message: "Elige al menos un rol." }] }, 400);
    assert.equal(one.message, "roles: Elige al menos un rol.");
    assert.deepEqual(one.details, []);
  });
});
