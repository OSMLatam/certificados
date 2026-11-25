import { describe, expect, it } from "vitest";
import { createPermalinkSlug, isPermalinkSlug, PERMALINK_SLUG_LENGTH } from "./slug";

describe("createPermalinkSlug", () => {
  it("emits a 12-character permalink slug", () => {
    const slug = createPermalinkSlug();
    expect(slug).toHaveLength(PERMALINK_SLUG_LENGTH);
    expect(isPermalinkSlug(slug)).toBe(true);
  });
});
