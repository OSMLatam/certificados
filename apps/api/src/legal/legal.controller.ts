import { Body, Controller, Get, Inject, Patch, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import { AdminRoleGuard } from "../audit/admin-role.guard";
import { validationFailed } from "../common/http";
import { LegalService, rejectFolioPatch } from "./legal.service";

const signer = z.object({
  slot: z.number().int().min(1).max(8),
  name: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(255),
});

const legalPatch = z
  .object({
    entityName: z.string().trim().max(255).optional(),
    nit: z.string().trim().max(50).optional(),
    representative: z.string().trim().max(255).optional(),
    issueCity: z.string().trim().max(255).optional(),
    disclaimer: z.string().trim().min(1).max(500).optional(),
    signers: z.array(signer).max(8).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Indica qué dato legal cambia.");

type RequestWithIp = AdminRequest & { ip?: string };

@Controller("admin/instance/legal")
@UseGuards(AdminGuard, AdminRoleGuard)
export class LegalController {
  constructor(@Inject(LegalService) private readonly legal: LegalService) {}

  @Get()
  read() {
    return this.legal.read();
  }

  @Patch()
  update(@Req() request: RequestWithIp, @Body() body: unknown) {
    if (body && typeof body === "object") {
      rejectFolioPatch(body as Record<string, unknown>);
    }
    const parsed = legalPatch.safeParse(body);
    if (!parsed.success) {
      throw validationFailed(parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
    }
    const slots = parsed.data.signers?.map((item) => item.slot) ?? [];
    if (new Set(slots).size !== slots.length) {
      throw validationFailed([{ field: "signers", message: "Cada firmante ocupa un puesto distinto." }]);
    }
    return this.legal.patch(request.adminUser!.id, parsed.data, request.ip ?? null);
  }
}
