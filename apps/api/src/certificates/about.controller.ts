import { Controller, Get, Header, Inject } from "@nestjs/common";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { aboutMain, publicDocument } from "./public-chrome";
import { chromeFromEnv } from "./public-chrome-env";

@Controller()
export class AboutPageController {
  constructor(@Inject(ENV) private readonly env: AppEnv) {}

  @Get("about")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("X-Robots-Tag", "noai, noimageai")
  page(): string {
    const chrome = chromeFromEnv(this.env);
    return publicDocument({ title: `${chrome.siteName}: acerca de`, chrome, main: aboutMain(chrome) });
  }
}
