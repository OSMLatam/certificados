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
    assert.equal(one.details[0]?.field, "roles");
    assert.equal(one.details[0]?.message, "Elige al menos un rol.");

    const named = formatDetail({
      row: 2,
      field: "full_name",
      message:
        'Fila 2: ya existe una persona con este documento (o correo) llamada "Cami Soto"; aquí viene como "Camila Soto Lara". Corrige el nombre para que coincida, o corrige primero a la persona existente.',
    });
    assert.equal(named.startsWith("Fila 2: ya existe"), true);

    const signedOut = failureFromBody({ message: "Unauthorized", statusCode: 401 }, 401);
    assert.equal(signedOut.message, "Inicia sesión con tu cuenta de OpenStreetMap para entrar al panel");
  });
});
