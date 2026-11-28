import { Controller, Get, Header, Inject, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { isPermalinkSlug } from "@certificados/shared";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { permalinkPage } from "./permalink-page";
import { PermalinkThrottleGuard } from "./permalink-throttle.guard";
import { chromeFromEnv } from "./public-chrome-env";

@Controller("c")
@UseGuards(PermalinkThrottleGuard)
export class PermalinkPageController {
  constructor(@Inject(ENV) private readonly env: AppEnv) {}

  @Get(":slug")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("X-Robots-Tag", "noai, noimageai")
  page(@Param("slug") slug: string): string {
    if (!isPermalinkSlug(slug)) {
      throw new NotFoundException();
    }
    const base = this.env.PUBLIC_BASE_URL.replace(/\/$/, "");
    return permalinkPage(slug, chromeFromEnv(this.env), this.env.PRIVACY_CONTACT_EMAIL, `${base}/c/${slug}`);
  }
}

@Controller()
export class RobotsController {
  @Get("robots.txt")
  @Header("Content-Type", "text/plain; charset=utf-8")
  robots(): string {
    return ["User-agent: *", "Allow: /", "Allow: /c/", "Allow: /b/", "Allow: /badges/", "Allow: /privacy", "Allow: /about", "Allow: /help", "Disallow: /api/", "Disallow: /admin/", ""].join("\n");
  }
}
