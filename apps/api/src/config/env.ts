import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  INSTANCE: z.enum(["osm_lat", "ac3"]),
  PUBLIC_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_REGION: z.string().min(1),
  STORAGE_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().min(1).default("cert_session"),
  SESSION_MAX_AGE_MS: z.coerce.number().int().positive().default(86_400_000),
  OSM_OAUTH_CLIENT_ID: z.string().min(1),
  OSM_OAUTH_CLIENT_SECRET: z.string().min(1),
  OSM_OAUTH_REDIRECT_URI: z.string().url(),
  SEED_ADMIN_OSM_USERNAMES: z.string().default(""),
  SEED_ADMIN_OSM_IDS: z.string().default(""),
  SOFTWARE_NAME: z.string().min(1),
  SOFTWARE_REPO_URL: z.string().url(),
  SITE_NAME: z.string().min(1).default("Certificados"),
  SITE_LOGO_URL: z.string().default(""),
  SITE_FOOTER_TEXT: z.string().default(""),
  SOFTWARE_CREDIT_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  SOFTWARE_CREDIT_TEXT: z.string().default(""),
  PRIVACY_NOTICE_FILE: z.string().min(1).default("docs/anexos/privacy-notice.placeholder.md"),
  PRIVACY_CONTACT_EMAIL: z
    .string()
    .trim()
    .default("")
    .refine((value) => value === "" || /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value), "Invalid email"),
  PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  PDF_CONCURRENCY: z.coerce.number().int().positive().default(1),
  PDF_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  PDF_MAX_ISSUE_ATTEMPTS: z.coerce.number().int().positive().default(5),
  PUPPETEER_EXECUTABLE_PATH: z.string().default(""),
  PUPPETEER_NO_SANDBOX: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PREVIEW_BOT_UA_REGEX: z
    .string()
    .default("")
    .refine((value) => {
      if (!value.trim()) {
        return true;
      }
      try {
        new RegExp(value);
        return true;
      } catch {
        return false;
      }
    }, "Invalid regular expression"),
  THROTTLE_SEARCH_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_SEARCH_LIMIT: z.coerce.number().int().positive().default(10),
  THROTTLE_PERMALINK_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_PERMALINK_LIMIT: z.coerce.number().int().positive().default(60),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default(""),
  OPS_ALERT_EMAIL: z
    .string()
    .trim()
    .default("")
    .refine((value) => value === "" || /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value), "Invalid email"),
  OPS_ALERT_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  OPS_ALERT_PENDING_HOURS: z.coerce.number().int().positive().default(24),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }
  assertProductionSecrets(parsed.data);
  return parsed.data;
}

export function assertProductionSecrets(env: AppEnv): void {
  if (env.NODE_ENV !== "production") {
    return;
  }
  if (env.SESSION_SECRET.includes("change-me")) {
    throw new Error("SESSION_SECRET must be replaced in production");
  }
  if (env.STORAGE_ACCESS_KEY === "minioadmin" || env.STORAGE_SECRET_KEY === "minioadmin") {
    throw new Error("STORAGE credentials must be replaced in production");
  }
}
