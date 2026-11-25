import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AdminRole } from "@prisma/client";
import { validationFailed } from "../common/http";
import { PrismaService } from "../prisma/prisma.service";

export type UserPatch = {
  role?: AdminRole | null;
  isActive?: boolean;
};

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(page: number, pageSize: number) {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.adminUser.count(),
      this.prisma.adminUser.findMany({
        orderBy: [{ osmUsername: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map(toUser),
      meta: { page, pageSize, total },
    };
  }

  async update(actorId: string, id: string, patch: UserPatch, ipAddress: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.adminUser.findUnique({ where: { id } });
      if (!current) {
        throw new NotFoundException();
      }
      const nextRole = patch.role === undefined ? current.role : patch.role;
      const nextActive = patch.isActive === undefined ? current.isActive : patch.isActive;
      const wasAdmin = current.role === "admin" && current.isActive;
      const staysAdmin = nextRole === "admin" && nextActive;
      if (wasAdmin && !staysAdmin) {
        const others = await tx.adminUser.count({
          where: { role: "admin", isActive: true, id: { not: current.id } },
        });
        if (others === 0) {
          throw validationFailed([{ field: "role", message: "Tiene que quedar al menos un administrador activo." }]);
        }
      }
      const updated = await tx.adminUser.update({
        where: { id: current.id },
        data: {
          role: nextRole,
          isActive: nextActive,
        },
      });
      if (patch.role !== undefined && patch.role !== current.role) {
        await tx.auditLog.create({
          data: {
            adminUserId: actorId,
            action: "user_role_change",
            entityType: "admin_user",
            entityId: current.id,
            ipAddress,
            metadata: { old_role: current.role, new_role: patch.role },
          },
        });
      }
      if (patch.isActive !== undefined && patch.isActive !== current.isActive) {
        await tx.auditLog.create({
          data: {
            adminUserId: actorId,
            action: "user_activation_change",
            entityType: "admin_user",
            entityId: current.id,
            ipAddress,
            metadata: { old_active: current.isActive, new_active: patch.isActive },
          },
        });
      }
      return toUser(updated);
    });
  }
}

function toUser(user: {
  id: string;
  osmId: bigint;
  osmUsername: string;
  role: AdminRole | null;
  isActive: boolean;
  lastLoginAt: Date | null;
}) {
  return {
    id: user.id,
    osmId: user.osmId.toString(),
    osmUsername: user.osmUsername,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}
