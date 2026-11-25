import type { AppEnv } from "../config/env";
import type { PublicChrome } from "./public-chrome";

export function chromeFromEnv(env: AppEnv): PublicChrome {
  return {
    siteName: env.SITE_NAME,
    footerText: env.SITE_FOOTER_TEXT,
    creditEnabled: env.SOFTWARE_CREDIT_ENABLED,
    softwareName: env.SOFTWARE_NAME,
    softwareRepoUrl: env.SOFTWARE_REPO_URL,
    creditText: env.SOFTWARE_CREDIT_TEXT,
  };
}
