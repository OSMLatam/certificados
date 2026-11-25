import { CanActivate, ExecutionContext, HttpException, Inject, Injectable } from "@nestjs/common";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { PermalinkThrottle } from "../pdf/permalink-throttle";

type ThrottledRequest = { ip?: string };
type ThrottledReply = { setHeader(name: string, value: string): void };

@Injectable()
export class SearchThrottleGuard implements CanActivate {
  private readonly throttle: PermalinkThrottle;

  constructor(@Inject(ENV) env: AppEnv) {
    this.throttle = new PermalinkThrottle(env.THROTTLE_SEARCH_LIMIT, env.THROTTLE_SEARCH_TTL_MS);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ThrottledRequest>();
    const response = context.switchToHttp().getResponse<ThrottledReply>();
    const decision = this.throttle.consume(request.ip || "unknown");
    if (!decision.ok) {
      response.setHeader("Retry-After", String(decision.retryAfter));
      throw new HttpException(
        {
          statusCode: 429,
          error: "Too Many Requests",
          message: "Demasiadas solicitudes. Espera un momento.",
        },
        429,
      );
    }
    return true;
  }
}
