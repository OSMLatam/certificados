import { Controller, Get, Inject, Post, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { AuthService } from "./auth.service";
import { sessionCookie } from "./cookies";
import { createOAuthState, verifyOAuthState } from "./oauth-state";
import { OsmOAuthClient } from "./osm-oauth.client";

interface CookieRequest {
  headers: { cookie?: string };
}

interface HttpReply {
  setHeader(name: string, value: string): void;
  redirect(status: number, url: string): void;
}

@Controller("admin/auth")
export class AuthController {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(OsmOAuthClient) private readonly osm: OsmOAuthClient,
  ) {}

  @Get("osm/start")
  start(@Res() reply: HttpReply): void {
    const state = createOAuthState(this.env.SESSION_SECRET);
    reply.redirect(302, this.osm.authorizeUrl(state));
  }

  @Get("osm/callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Res() reply: HttpReply,
  ): Promise<void> {
    if (!code || !state || !verifyOAuthState(this.env.SESSION_SECRET, state)) {
      reply.redirect(302, this.loginUrl("state"));
      return;
    }
    try {
      const result = await this.auth.loginWithCode(code);
      reply.setHeader("Set-Cookie", this.cookie(result.sessionId, this.env.SESSION_MAX_AGE_MS));
      const allowed = result.user.isActive && result.user.role !== null;
      reply.redirect(302, allowed ? `${this.env.PUBLIC_BASE_URL}/admin` : this.loginUrl("forbidden"));
    } catch {
      reply.redirect(302, this.loginUrl("osm"));
    }
  }

  @Get("me")
  async me(@Req() request: CookieRequest) {
    const user = await this.auth.userFromCookie(request.headers.cookie);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  @Post("logout")
  async logout(@Req() request: CookieRequest, @Res({ passthrough: true }) reply: HttpReply) {
    await this.auth.logout(request.headers.cookie);
    reply.setHeader("Set-Cookie", this.cookie("", 0));
    return { ok: true };
  }

  private cookie(value: string, maxAgeMs: number): string {
    return sessionCookie(
      this.env.SESSION_COOKIE_NAME,
      value,
      Math.floor(maxAgeMs / 1000),
      this.env.NODE_ENV === "production",
    );
  }

  private loginUrl(error: string): string {
    return `${this.env.PUBLIC_BASE_URL}/admin/login?error=${error}`;
  }
}
