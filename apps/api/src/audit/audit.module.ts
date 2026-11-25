import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminRoleGuard } from "./admin-role.guard";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditService, AdminRoleGuard],
})
export class AuditModule {}
