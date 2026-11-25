import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AdminModule } from "./admin/admin.module";
import { AdminOriginGuard } from "./auth/admin-origin.guard";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CertificatesModule } from "./certificates/certificates.module";
import { ConfigModule } from "./config/config.module";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { OpsModule } from "./ops/ops-alert.module";
import { PregeneratedModule } from "./pregenerated/pregenerated.module";
import { PrismaModule } from "./prisma/prisma.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [ConfigModule, PrismaModule, StorageModule, HealthModule, AuthModule, EventsModule, CertificatesModule, PregeneratedModule, AuditModule, OpsModule, AdminModule],
  providers: [{ provide: APP_GUARD, useClass: AdminOriginGuard }],
})
export class AppModule {}
