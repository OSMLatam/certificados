import { randomBytes } from "node:crypto";

/** Permalink alphabet (64 symbols, so a random byte maps without bias). 12 chars ≈ 72 bits. */
const SLUG_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export const PERMALINK_SLUG_LENGTH = 12;
export const SLUG_GENERATION_ATTEMPTS = 5;

export function createPermalinkSlug(): string {
  const bytes = randomBytes(PERMALINK_SLUG_LENGTH);
  let slug = "";
  for (let index = 0; index < PERMALINK_SLUG_LENGTH; index += 1) {
    slug += SLUG_ALPHABET[bytes[index]! & 63];
  }
  return slug;
}

const slugPattern = new RegExp(`^[A-Za-z0-9_-]{${PERMALINK_SLUG_LENGTH}}$`);

export function isPermalinkSlug(value: string): boolean {
  return slugPattern.test(value);
}
