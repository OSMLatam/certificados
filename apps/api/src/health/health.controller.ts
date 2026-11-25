import { Controller, Get, Inject, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

type Check = "up" | "down";

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  @Get("health")
  live() {
    return {
      status: "ok",
      instance: this.env.INSTANCE,
      software: this.software(),
    };
  }

  @Get("ready")
  async ready() {
    const checks = {
      database: await this.check(() => this.prisma.$queryRaw`SELECT 1`),
      storage: await this.check(() => this.storage.ping()),
    };
    const body = {
      status: checks.database === "up" && checks.storage === "up" ? "ok" : "error",
      checks,
      instance: this.env.INSTANCE,
      software: this.software(),
    };
    if (body.status !== "ok") {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }

  private software() {
    return {
      name: this.env.SOFTWARE_NAME,
      version: "0.1.0",
      repository: this.env.SOFTWARE_REPO_URL,
    };
  }

  private async check(run: () => Promise<unknown>): Promise<Check> {
    try {
      await run();
      return "up";
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      this.logger.warn(message);
      return "down";
    }
  }
}
