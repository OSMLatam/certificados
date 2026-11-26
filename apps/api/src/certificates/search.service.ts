import { Inject, Injectable } from "@nestjs/common";
import { isNormalizeStrategy, normalizeEmail } from "@certificados/shared";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { formatDateOnly, validationFailed } from "../common/http";
import { normalizeDocument } from "../participants/document-rules";
import { PrismaService } from "../prisma/prisma.service";
import type { SearchQuery } from "./search-query";

const EMPTY_MESSAGE = "No encontramos credenciales con esos datos.";

function shownActivity(certificateTitle: string | null, participantTitle: string | null): string | null {
  const value = (certificateTitle ?? participantTitle ?? "").trim();
  return value.length > 0 ? value : null;
}

export type SearchItem = {
  slug: string;
  permalink: string;
  status: string;
  fullName: string | null;
  eventName: string;
  year: number;
  roleCode: string;
  roleLabel: string;
  activityTitle: string | null;
  eventDate: string;
  venueName: string | null;
};

@Injectable()
export class SearchService {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async search(query: SearchQuery): Promise<{ message: string | null; items: SearchItem[] }> {
    const where =
      query.kind === "email"
        ? { email: normalizeEmail(query.email) }
        : await this.documentWhere(query);
    const people = await this.prisma.participant.findMany({
      where: {
        ...where,
        erasedAt: null,
        event: { status: "active", deletedAt: null },
      },
      include: {
        event: true,
        certificates: { include: { venue: true } },
      },
    });
    const codes = [...new Set(people.flatMap((person) => person.certificates.map((certificate) => certificate.roleCode)))];
    const roles = await this.prisma.role.findMany({ where: { code: { in: codes } } });
    const labels = new Map(roles.map((role) => [role.code, role.label]));
    const items = people
      .flatMap((person) =>
        person.certificates.map((certificate) => {
          const when = certificate.venue?.eventDate ?? person.event.startDate;
          const revoked = certificate.status === "revoked";
          return {
            sort: when.getTime(),
            item: {
              slug: certificate.slug,
              permalink: `${this.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/c/${certificate.slug}`,
              status: certificate.status,
              fullName: revoked ? null : person.fullName,
              eventName: person.event.name,
              year: person.event.year,
              roleCode: certificate.roleCode,
              roleLabel: labels.get(certificate.roleCode) ?? certificate.roleCode,
              activityTitle: shownActivity(certificate.activityTitle, person.activityTitle),
              eventDate: formatDateOnly(when),
              venueName: revoked ? null : certificate.venue?.name ?? null,
            } satisfies SearchItem,
          };
        }),
      )
      .sort((left, right) => right.sort - left.sort || left.item.roleLabel.localeCompare(right.item.roleLabel, "es"))
      .map((entry) => entry.item);
    return { message: items.length === 0 ? EMPTY_MESSAGE : null, items };
  }

  private async documentWhere(query: Extract<SearchQuery, { kind: "document" }>) {
    const countryCode = query.countryCode.trim().toUpperCase();
    const docTypeCode = query.docTypeCode.trim().toUpperCase();
    const rule = await this.prisma.countryIdentityConfig.findUnique({
      where: { countryCode_docTypeCode: { countryCode, docTypeCode } },
    });
    const normalized = normalizeDocument(
      { countryCode, docTypeCode, docNumber: query.docNumber },
      rule && isNormalizeStrategy(rule.normalize) ? { normalize: rule.normalize, validationRegex: rule.validationRegex } : null,
    );
    if (!normalized.ok) {
      throw validationFailed([{ field: normalized.field, message: normalized.message }]);
    }
    return {
      countryCode: normalized.value.countryCode,
      docTypeCode: normalized.value.docTypeCode,
      docNumber: normalized.value.docNumber,
    };
  }
}
