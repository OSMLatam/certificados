import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import type { Browser, Page } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";

@Injectable()
export class PdfService implements OnModuleDestroy {
  private browser: Browser | null = null;
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(@Inject(ENV) private readonly env: AppEnv) {}

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  async render(html: string): Promise<Buffer> {
    await this.acquire();
    let page: Page | null = null;
    try {
      const browser = await this.launch();
      page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const url = request.url();
        if (url === "about:blank" || url.startsWith("data:")) {
          void request.continue();
          return;
        }
        void request.abort();
      });
      await page.setContent(html, { waitUntil: "load", timeout: this.env.PDF_TIMEOUT_MS });
      const pdf = await page.pdf({
        width: "297mm",
        height: "210mm",
        printBackground: true,
        preferCSSPageSize: true,
        timeout: this.env.PDF_TIMEOUT_MS,
      });
      return Buffer.from(pdf);
    } finally {
      await page?.close().catch(() => undefined);
      this.release();
    }
  }

  private async launch(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }
    const args = ["--disable-dev-shm-usage", "--disable-gpu"];
    if (this.env.PUPPETEER_NO_SANDBOX) {
      args.push("--no-sandbox", "--disable-setuid-sandbox");
    }
    this.browser = await puppeteer.launch({
      executablePath: this.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
      headless: true,
      args,
    });
    return this.browser;
  }

  private async acquire(): Promise<void> {
    if (this.active < this.env.PDF_CONCURRENCY) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    this.waiting.shift()?.();
  }
}
