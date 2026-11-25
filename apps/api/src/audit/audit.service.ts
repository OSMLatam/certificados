import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { parseDateOnly } from "../common/http";
import { PrismaService } from "../prisma/prisma.service";
import type { AuditQuery } from "./audit-query";

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) {
      where.action = query.action;
    }
    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from ? parseDateOnly(query.from) : undefined,
        lt: query.to ? nextUtcDay(query.to) : undefined,
      };
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { adminUser: { select: { id: true, osmUsername: true } } },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        ipAddress: row.ipAddress,
        metadata: row.metadata,
        actor: row.adminUser ? { id: row.adminUser.id, name: row.adminUser.osmUsername } : null,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }
}

function nextUtcDay(value: string): Date {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
