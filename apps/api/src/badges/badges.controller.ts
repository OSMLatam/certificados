import { Body, Controller, Get, Header, Inject, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
import { isPermalinkSlug } from "@certificados/shared";
import { z } from "zod";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import { AdminRoleGuard } from "../audit/admin-role.guard";
import { PermalinkThrottleGuard } from "../certificates/permalink-throttle.guard";
import { badgePage } from "./badge-page";
import { chromeFromEnv } from "../certificates/public-chrome-env";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { validationFailed } from "../common/http";
import { PrismaService } from "../prisma/prisma.service";
import { badgeImageUrl, DEFAULT_BADGE_SVG } from "./default-badge";
import { revokeBadgeOnly } from "./badge-sync";
import { assertionJson, classJson, issuerJson, publicBadge, revocationsJson, verifyBadge, verifyCertificate } from "./badge-documents";

type RequestWithIp = AdminRequest & { ip?: string };

const revokeBody = z.object({ revokeReason: z.string().trim().max(500).optional() });

function stripJson(id: string): string {
  return id.endsWith(".json") ? id.slice(0, -5) : id;
}

@Controller("badges")
export class BadgeDocumentController {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get("default.svg")
  @Header("Content-Type", "image/svg+xml; charset=utf-8")
  @Header("Cache-Control", "public, max-age=86400")
  defaultImage(): string {
    return DEFAULT_BADGE_SVG;
  }

  @Get("issuer.json")
  @Header("Content-Type", "application/ld+json; charset=utf-8")
  issuer() {
    return issuerJson(this.prisma, this.env.PUBLIC_BASE_URL, this.env.SITE_NAME, this.env.PRIVACY_CONTACT_EMAIL);
  }

  @Get("revocations.json")
  @Header("Content-Type", "application/ld+json; charset=utf-8")
  revocations() {
    return revocationsJson(this.prisma, this.env.PUBLIC_BASE_URL);
  }

  @Get("classes/:id")
  @Header("Content-Type", "application/ld+json; charset=utf-8")
  async badgeClass(@Param("id") id: string) {
    const image = badgeImageUrl(this.env.PUBLIC_BASE_URL, this.env.SITE_LOGO_URL);
    const document = await classJson(this.prisma, this.env.PUBLIC_BASE_URL, stripJson(id), image);
    if (!document) {
      throw new NotFoundException();
    }
    return document;
  }

  @Get("assertions/:uuid")
  @Header("Content-Type", "application/ld+json; charset=utf-8")
  async assertion(@Param("uuid") uuid: string) {
    const document = await assertionJson(this.prisma, this.env.PUBLIC_BASE_URL, stripJson(uuid));
    if (!document) {
      throw new NotFoundException();
    }
    return document;
  }
}

@Controller("b")
@UseGuards(PermalinkThrottleGuard)
export class BadgePageController {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get(":slug")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("X-Robots-Tag", "noai, noimageai")
  async page(@Param("slug") slug: string): Promise<string> {
    if (!isPermalinkSlug(slug)) {
      throw new NotFoundException();
    }
    const badge = await publicBadge(this.prisma, this.env.PUBLIC_BASE_URL, slug, this.env.SITE_NAME);
    if (!badge) {
      throw new NotFoundException();
    }
    const assertion = await this.prisma.badgeAssertion.findUnique({ where: { slug } });
    const document = assertion ? await assertionJson(this.prisma, this.env.PUBLIC_BASE_URL, assertion.uuid) : null;
    const base = this.env.PUBLIC_BASE_URL.replace(/\/$/, "");
    return badgePage(
      slug,
      chromeFromEnv(this.env),
      this.env.PRIVACY_CONTACT_EMAIL,
      `${base}/b/${slug}`,
      document,
      badgeImageUrl(this.env.PUBLIC_BASE_URL, this.env.SITE_LOGO_URL),
    );
  }
}

@Controller("public/badges")
@UseGuards(PermalinkThrottleGuard)
export class PublicBadgeController {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get(":slug")
  async show(@Param("slug") slug: string) {
    if (!isPermalinkSlug(slug)) {
      throw new NotFoundException();
    }
    const badge = await publicBadge(this.prisma, this.env.PUBLIC_BASE_URL, slug, this.env.SITE_NAME);
    if (!badge) {
      throw new NotFoundException();
    }
    return badge;
  }
}

@Controller("verify")
@UseGuards(PermalinkThrottleGuard)
export class VerifyController {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get("c/:slug")
  async certificate(@Param("slug") slug: string) {
    const result = await verifyCertificate(this.prisma, this.env.PUBLIC_BASE_URL, slug);
    if (!result) {
      throw new NotFoundException();
    }
    return result;
  }

  @Get("b/:slug")
  async badge(@Param("slug") slug: string) {
    const result = await verifyBadge(this.prisma, this.env.PUBLIC_BASE_URL, slug);
    if (!result) {
      throw new NotFoundException();
    }
    return result;
  }
}

@Controller("admin/badges")
@UseGuards(AdminGuard, AdminRoleGuard)
export class BadgeAdminController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Post(":id/revoke")
  async revoke(@Req() request: RequestWithIp, @Param("id") id: string, @Body() body: unknown) {
    const parsed = revokeBody.safeParse(body ?? {});
    if (!parsed.success) {
      throw validationFailed(parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
    }
    const reason = parsed.data.revokeReason ?? "";
    const revoked = await revokeBadgeOnly(this.prisma, id, reason, new Date());
    if (!revoked) {
      throw new NotFoundException();
    }
    await this.prisma.auditLog.create({
      data: {
        adminUserId: request.adminUser!.id,
        action: "badge_revoke",
        entityType: "badge_assertion",
        entityId: id,
        ipAddress: request.ip ?? null,
        metadata: reason ? { revoke_reason: reason } : {},
      },
    });
    return { id, status: "revoked" as const };
  }
}
