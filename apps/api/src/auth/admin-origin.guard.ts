import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";

type OriginRequest = {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers: { origin?: string | string[] };
};

@Injectable()
export class AdminOriginGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: AppEnv) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") {
      return true;
    }
    const request = context.switchToHttp().getRequest<OriginRequest>();
    const method = (request.method ?? "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return true;
    }
    const path = (request.originalUrl ?? request.url ?? "").split("?")[0] ?? "";
    if (!path.includes("/admin/")) {
      return true;
    }
    const raw = request.headers.origin;
    const origin = Array.isArray(raw) ? raw[0] : raw;
    if (origin !== new URL(this.env.PUBLIC_BASE_URL).origin) {
      throw new ForbiddenException();
    }
    return true;
  }
}
