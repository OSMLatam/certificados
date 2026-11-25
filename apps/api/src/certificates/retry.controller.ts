import { Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import { validationFailed } from "../common/http";
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

  @Post(":id/revoke")
  @HttpCode(200)
  revoke(@Req() request: RequestWithIp, @Param("id") id: string, @Body() body: unknown) {
    const parsed = z.object({ revokeReason: z.string().trim().max(500).optional() }).safeParse(body ?? {});
    if (!parsed.success) {
      throw validationFailed(parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || "revokeReason", message: issue.message })));
    }
    return this.issue.revoke(request.adminUser!.id, id, parsed.data.revokeReason, request.ip ?? null);
  }
}
