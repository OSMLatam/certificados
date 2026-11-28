import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { revokeEventRoleBadge } from "../badges/badge-sync";

@Injectable()
export class EraseService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async erase(adminUserId: string, participantId: string, ipAddress: string | null): Promise<{ id: string }> {
    const keys = await this.prisma.$transaction(async (tx) => {
      const person = await tx.participant.findUnique({
        where: { id: participantId },
        include: { certificates: { include: { storedFile: true } } },
      });
      if (!person || person.erasedAt) {
        return null;
      }
      const when = new Date();
      const storageKeys = person.certificates.flatMap((certificate) =>
        certificate.storedFile ? [certificate.storedFile.storageKey] : [],
      );
      const certificateIds = person.certificates.map((certificate) => certificate.id);
      if (certificateIds.length > 0) {
        await tx.permalinkAccessLog.deleteMany({ where: { certificateId: { in: certificateIds } } });
      }
      for (const certificate of person.certificates) {
        if (certificate.status !== "revoked") {
          await tx.certificate.update({
            where: { id: certificate.id },
            data: { status: "revoked", revokedAt: when, revokeReason: "participant_erase" },
          });
          await revokeEventRoleBadge(tx, certificate.id, "participant_erase", when);
          await tx.auditLog.create({
            data: {
              adminUserId,
              action: "certificate_revoke",
              entityType: "certificate",
              entityId: certificate.id,
              ipAddress,
              metadata: { reason: "participant_erase" },
            },
          });
        }
      }
      await tx.participant.update({
        where: { id: person.id },
        data: {
          fullName: "Persona borrada",
          email: null,
          countryCode: null,
          docTypeCode: null,
          docNumber: null,
          activityTitle: null,
          erasedAt: when,
          erasedById: adminUserId,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId,
          action: "participant_erase",
          entityType: "participant",
          entityId: person.id,
          ipAddress,
          metadata: { certificate_count: certificateIds.length },
        },
      });
      return storageKeys;
    });
    if (!keys) {
      throw new NotFoundException();
    }
    for (const key of keys) {
      await this.storage.delete(key).catch(() => undefined);
    }
    return { id: participantId };
  }
}
