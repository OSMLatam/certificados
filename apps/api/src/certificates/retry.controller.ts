import { Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import { IssueService } from "./issue.service";

type RequestWithIp = AdminRequest & { ip?: string };

@Controller("admin/certificates")
@UseGuards(AdminGuard)
export class RetryIssueController {
  constructor(@Inject(IssueService) private readonly issue: IssueService) {}

  @Post(":id/retry-issue")
  @HttpCode(200)
  retry(@Req() request: RequestWithIp, @Param("id") id: string) {
    return this.issue.retry(request.adminUser!.id, id, request.ip ?? null);
  }
}
