import { describe, expect, it } from "vitest";
import { normalizeActivityKey, normalizeDocNumber, normalizeEmail } from "./normalize";

describe("normalizeDocNumber", () => {
  it("keeps only digits", () => {
    expect(normalizeDocNumber("12.345.678-9", "digits")).toBe("123456789");
  });

  it("uppercases alphanumeric documents", () => {
    expect(normalizeDocNumber("ab-12 34", "alnum")).toBe("AB1234");
  });

  it("only trims raw values", () => {
    expect(normalizeDocNumber("  AB-12  ", "raw")).toBe("AB-12");
  });
});

describe("normalizeActivityKey", () => {
  it("drops accents and case and collapses spaces", () => {
    expect(normalizeActivityKey("  Comité   IT ")).toBe("comite it");
    expect(normalizeActivityKey("")).toBe("");
  });
});

describe("normalizeEmail", () => {
  it("drops spaces and lowercases", () => {
    expect(normalizeEmail("  Ana@Mail.COM ")).toBe("ana@mail.com");
    expect(normalizeEmail("Ana @ Mail.COM")).toBe("ana@mail.com");
  });
});
