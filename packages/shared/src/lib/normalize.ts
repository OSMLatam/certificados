export const NORMALIZE_STRATEGIES = ["digits", "alnum", "raw"] as const;

export type NormalizeStrategy = (typeof NORMALIZE_STRATEGIES)[number];

export function isNormalizeStrategy(value: string): value is NormalizeStrategy {
  return (NORMALIZE_STRATEGIES as readonly string[]).includes(value);
}

/** trim + lower. One identity key for a participant inside one event, when the address is present. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Same function on write and on public search.
 * Strategy comes from country_identity_config.normalize, never from a country branch.
 */
export function normalizeDocNumber(value: string, strategy: NormalizeStrategy): string {
  const trimmed = value.trim();
  if (strategy === "raw") {
    return trimmed;
  }
  const withoutSeparators = trimmed.replace(/[\s.,-]/g, "");
  if (strategy === "digits") {
    return withoutSeparators.replace(/\D/g, "");
  }
  return withoutSeparators.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
