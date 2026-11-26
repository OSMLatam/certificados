import { Controller, Get, Header, Inject } from "@nestjs/common";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { helpPage } from "./help-page";
import { chromeFromEnv } from "./public-chrome-env";

@Controller()
export class HelpPageController {
  constructor(@Inject(ENV) private readonly env: AppEnv) {}

  @Get("help")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("X-Robots-Tag", "noai, noimageai")
  page(): string {
    return helpPage(chromeFromEnv(this.env), this.env.PUBLIC_BASE_URL);
  }
}
