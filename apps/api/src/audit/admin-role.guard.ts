import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AdminRequest } from "../auth/admin.guard";

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (request.adminUser?.role !== "admin") {
      throw new ForbiddenException();
    }
    return true;
  }
}
