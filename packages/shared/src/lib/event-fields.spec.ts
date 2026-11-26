import { describe, expect, it } from "vitest";
import { EVENT_NAME_MESSAGE, EVENT_START_MESSAGE, parseEventFields } from "./event-fields";

describe("parseEventFields", () => {
  it("asks for the name and the start date when both are blank", () => {
    const parsed = parseEventFields({ name: "  ", startDate: "" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues).toEqual([
        { field: "name", message: EVENT_NAME_MESSAGE },
        { field: "startDate", message: EVENT_START_MESSAGE },
      ]);
    }
  });

  it("accepts a trimmed name and a calendar date", () => {
    expect(parseEventFields({ name: "  Mapatón ", startDate: "2026-11-25" })).toEqual({
      ok: true,
      name: "Mapatón",
      startDate: "2026-11-25",
    });
  });
});
