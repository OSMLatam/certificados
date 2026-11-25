import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

export function createOAuthState(secret: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ n: randomBytes(16).toString("hex"), exp: now + STATE_TTL_MS }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(secret: string, state: string, now = Date.now()): boolean {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) {
    return false;
  }
  const payload = state.slice(0, dot);
  const signature = state.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return false;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof parsed.exp === "number" && parsed.exp > now;
  } catch {
    return false;
  }
}
