import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService, type AdminPrincipal } from "./auth.service";

export type AdminRequest = { headers: { cookie?: string }; adminUser?: AdminPrincipal };

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const user = await this.auth.userFromCookie(request.headers.cookie);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!user.isActive || user.role === null) {
      throw new ForbiddenException();
    }
    request.adminUser = user;
    return true;
  }
}
