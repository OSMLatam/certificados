import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { AdminRoleGuard } from "./admin-role.guard";
import { parseAuditQuery } from "./audit-query";
import { AuditService } from "./audit.service";

@Controller("admin/audit-log")
@UseGuards(AdminGuard, AdminRoleGuard)
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.audit.list(parseAuditQuery(query));
  }
}
