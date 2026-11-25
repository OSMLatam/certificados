import { describe, expect, it } from "vitest";
import { normalizeDocNumber, normalizeEmail } from "./normalize";

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

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ana@Mail.COM ")).toBe("ana@mail.com");
  });
});
