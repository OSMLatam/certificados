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
    return permalinkPage(slug, chromeFromEnv(this.env), this.env.PRIVACY_CONTACT_EMAIL);
  }
}

@Controller()
export class RobotsController {
  @Get("robots.txt")
  @Header("Content-Type", "text/plain; charset=utf-8")
  robots(): string {
    return ["User-agent: *", "Allow: /", "Allow: /c/", "Allow: /privacy", "Allow: /about", "Disallow: /api/", "Disallow: /admin/", ""].join("\n");
  }
}
