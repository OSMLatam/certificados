import { Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import { AdminRoleGuard } from "../audit/admin-role.guard";
import { EraseService } from "./erase.service";

type RequestWithIp = AdminRequest & { ip?: string };

@Controller("admin/participants")
@UseGuards(AdminGuard, AdminRoleGuard)
export class EraseController {
  constructor(@Inject(EraseService) private readonly eraseService: EraseService) {}

  @Post(":id/erase")
  @HttpCode(200)
  erase(@Req() request: RequestWithIp, @Param("id") id: string) {
    return this.eraseService.erase(request.adminUser!.id, id, request.ip ?? null);
  }
}
