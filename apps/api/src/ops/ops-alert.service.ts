import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { opsMessage, opsSignature, shouldNotify, type OpsNotice, type OpsSnapshot } from "./ops-alert";
import { OpsMailer } from "./ops-mailer";

export type OpsLog = { error(message: string): void };

@Injectable()
export class OpsAlertService implements OnModuleInit, OnModuleDestroy {
  private last: OpsNotice | null = null;
  private timer: NodeJS.Timeout | undefined;
  logger: OpsLog = new Logger(OpsAlertService.name);

  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(OpsMailer) private readonly mailer: OpsMailer,
  ) {}

  onModuleInit(): void {
    void this.run();
    const intervalMs = this.env.OPS_ALERT_INTERVAL_MINUTES * 60_000;
    this.timer = setInterval(() => {
      void this.run();
    }, intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async collect(now: number): Promise<OpsSnapshot> {
    const cutoff = new Date(now - this.env.OPS_ALERT_PENDING_HOURS * 60 * 60 * 1000);
    let readyDown = false;
    let failed = 0;
    let stuck = 0;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      failed = await this.prisma.certificate.count({ where: { status: "failed" } });
      stuck = await this.prisma.certificate.count({
        where: {
          status: "pending",
          issueAttempts: { gt: 0 },
          lastIssueAttemptAt: { lt: cutoff },
        },
      });
    } catch {
      readyDown = true;
    }
    try {
      await this.storage.ping();
    } catch {
      readyDown = true;
    }
    return { readyDown, failed, stuck };
  }

  async run(now = Date.now()): Promise<void> {
    const snapshot = await this.collect(now);
    if (!shouldNotify(this.last, snapshot, now)) {
      return;
    }
    const signature = opsSignature(snapshot);
    this.logger.error(`OPS_ALERT ${signature}`);
    this.last = { snapshot, at: now };
    if (!this.canMail()) {
      return;
    }
    try {
      await this.mailer.send(opsMessage(snapshot));
    } catch {
      this.logger.error("OPS_ALERT delivery failed");
    }
  }

  private canMail(): boolean {
    return this.env.OPS_ALERT_EMAIL !== "" && this.env.SMTP_HOST !== "" && this.env.SMTP_FROM !== "";
  }
}
