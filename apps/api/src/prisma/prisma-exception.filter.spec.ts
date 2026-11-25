import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { PrismaExceptionFilter } from "./prisma-exception.filter";

describe("prisma exception filter", () => {
  it("answers 400 when the identifier is not a UUID", () => {
    const sent: unknown[] = [];
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status: (code: number) => ({
            json: (body: unknown) => {
              sent.push(code, body);
            },
          }),
        }),
      }),
    };
    new PrismaExceptionFilter().catch(
      new Prisma.PrismaClientKnownRequestError("invalid uuid", { code: "P2023", clientVersion: "6.19.3" }),
      host as never,
    );
    assert.equal(sent[0], 400);
    assert.equal((sent[1] as { message: string }).message, "El identificador no es válido.");
  });
});
