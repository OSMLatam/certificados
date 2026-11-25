import { Body, Controller, Get, Header, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { validationFailed } from "../common/http";
import { SearchService } from "./search.service";
import { parseSearchQuery } from "./search-query";
import { searchPage } from "./search-page";
import { SearchThrottleGuard } from "./search-throttle.guard";
import { chromeFromEnv } from "./public-chrome-env";

@Controller("public")
@UseGuards(SearchThrottleGuard)
export class SearchController {
  constructor(@Inject(SearchService) private readonly search: SearchService) {}

  @Post("search")
  @HttpCode(200)
  find(@Body() body: unknown) {
    const parsed = parseSearchQuery(body);
    if (!parsed.ok) {
      throw validationFailed(parsed.details);
    }
    return this.search.search(parsed.query);
  }
}

@Controller()
export class SearchPageController {
  constructor(@Inject(ENV) private readonly env: AppEnv) {}

  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("X-Robots-Tag", "noai, noimageai")
  home(): string {
    return searchPage(chromeFromEnv(this.env));
  }
}
