import { Controller, Get, Header, Inject } from "@nestjs/common";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { privacyPage } from "./privacy-page";
import { loadPrivacyNotice } from "./privacy-notice";
import { chromeFromEnv } from "./public-chrome-env";

@Controller()
export class PrivacyPageController {
  constructor(@Inject(ENV) private readonly env: AppEnv) {}

  @Get("privacy")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("X-Robots-Tag", "noai, noimageai")
  page(): string {
    let notice: string;
    try {
      notice = loadPrivacyNotice(this.env.PRIVACY_NOTICE_FILE, {
        siteName: this.env.SITE_NAME,
        contactEmail: this.env.PRIVACY_CONTACT_EMAIL,
      });
    } catch {
      notice = "<h1>Datos personales</h1><p>El aviso de esta instancia no está disponible.</p>";
    }
    return privacyPage(notice, chromeFromEnv(this.env));
  }
}
