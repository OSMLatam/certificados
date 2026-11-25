import { Body, Controller, Get, Inject, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import { AdminRoleGuard } from "../audit/admin-role.guard";
import { validationFailed } from "../common/http";
import { SummaryService } from "./summary.service";
import { UsersService, type UserPatch } from "./users.service";

const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const userPatch = z
  .object({
    role: z.enum(["admin", "editor"]).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.role !== undefined || value.isActive !== undefined, "Indica el rol o si la cuenta sigue activa.");

type RequestWithIp = AdminRequest & { ip?: string };

@Controller("admin/summary")
@UseGuards(AdminGuard)
export class SummaryController {
  constructor(@Inject(SummaryService) private readonly summary: SummaryService) {}

  @Get()
  counts() {
    return this.summary.counts();
  }
}

@Controller("admin/users")
@UseGuards(AdminGuard, AdminRoleGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  list(@Query() query: unknown) {
    const page = parse(pageQuery, query);
    return this.users.list(page.page ?? 1, page.pageSize ?? 20);
  }

  @Patch(":id")
  update(@Req() request: RequestWithIp, @Param("id") id: string, @Body() body: unknown) {
    return this.users.update(request.adminUser!.id, id, parse(userPatch, body) as UserPatch, request.ip ?? null);
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw validationFailed(parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || "body", message: issue.message })));
  }
  return parsed.data;
}
