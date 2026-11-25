import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { AdminRole } from "@prisma/client";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { PrismaService } from "../prisma/prisma.service";
import { readCookie } from "./cookies";
import { OsmOAuthClient } from "./osm-oauth.client";
import { roleForLogin, splitCsv, type PanelRole } from "./osm-identity";

export type AdminPrincipal = {
  id: string;
  osmId: string;
  osmUsername: string;
  role: PanelRole;
  isActive: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OsmOAuthClient) private readonly osm: OsmOAuthClient,
  ) {}

  async loginWithCode(code: string): Promise<{ sessionId: string; user: AdminPrincipal }> {
    const accessToken = await this.osm.exchangeCode(code);
    const identity = await this.osm.fetchIdentity(accessToken);
    const osmId = BigInt(identity.osmId);
    const existing = await this.prisma.adminUser.findUnique({ where: { osmId } });
    const role = roleForLogin({
      osmId: identity.osmId,
      displayName: identity.displayName,
      currentRole: existing?.role ?? null,
      seedIds: splitCsv(this.env.SEED_ADMIN_OSM_IDS),
      seedNames: splitCsv(this.env.SEED_ADMIN_OSM_USERNAMES),
    });
    const user = await this.prisma.adminUser.upsert({
      where: { osmId },
      create: {
        osmId,
        osmUsername: identity.displayName,
        role,
        isActive: true,
        lastLoginAt: new Date(),
      },
      update: {
        osmUsername: identity.displayName,
        role,
        lastLoginAt: new Date(),
      },
    });
    const sessionId = randomBytes(32).toString("hex");
    await this.prisma.adminSession.create({
      data: {
        id: sessionId,
        adminUserId: user.id,
        data: {},
        expiresAt: new Date(Date.now() + this.env.SESSION_MAX_AGE_MS),
      },
    });
    return { sessionId, user: toPrincipal(user) };
  }

  async userFromCookie(cookieHeader: string | undefined): Promise<AdminPrincipal | null> {
    const sessionId = readCookie(cookieHeader, this.env.SESSION_COOKIE_NAME);
    if (!sessionId) {
      return null;
    }
    const session = await this.prisma.adminSession.findUnique({
      where: { id: sessionId },
      include: { adminUser: true },
    });
    if (!session) {
      return null;
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.adminSession.delete({ where: { id: session.id } });
      return null;
    }
    return toPrincipal(session.adminUser);
  }

  async logout(cookieHeader: string | undefined): Promise<void> {
    const sessionId = readCookie(cookieHeader, this.env.SESSION_COOKIE_NAME);
    if (!sessionId) {
      return;
    }
    await this.prisma.adminSession.deleteMany({ where: { id: sessionId } });
  }
}

function toPrincipal(user: {
  id: string;
  osmId: bigint;
  osmUsername: string;
  role: AdminRole | null;
  isActive: boolean;
}): AdminPrincipal {
  return {
    id: user.id,
    osmId: user.osmId.toString(),
    osmUsername: user.osmUsername,
    role: user.role,
    isActive: user.isActive,
  };
}
