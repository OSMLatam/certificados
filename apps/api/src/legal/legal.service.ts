import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { PrismaService } from "../prisma/prisma.service";
import { captureLegalSnapshot, ensureLegalRow, reserveAc3Folio } from "./legal-issue";
import { changedLegalKeys, legalTextValues, type LegalSnapshot } from "./legal-snapshot";

export type LegalPatch = {
  entityName?: string;
  nit?: string;
  representative?: string;
  issueCity?: string;
  disclaimer?: string;
  signers?: { slot: number; name: string; title: string }[];
};

@Injectable()
export class LegalService {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  requireAc3(): void {
    if (this.env.INSTANCE !== "ac3") {
      throw new NotFoundException();
    }
  }

  async read() {
    this.requireAc3();
    const row = await this.ensureRow();
    return this.toView(row);
  }

  async patch(adminUserId: string, patch: LegalPatch, ipAddress: string | null) {
    this.requireAc3();
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await this.ensureRow(tx);
      const data = {
        entityName: patch.entityName ?? before.entityName,
        nit: patch.nit ?? before.nit,
        representative: patch.representative ?? before.representative,
        issueCity: patch.issueCity ?? before.issueCity,
        disclaimer: patch.disclaimer ?? before.disclaimer,
        updatedById: adminUserId,
      };
      const keys = changedLegalKeys(before, data);
      if (patch.signers) {
        keys.push("signers");
        await tx.instanceLegalSigner.deleteMany({ where: { instanceLegalId: before.id } });
        if (patch.signers.length > 0) {
          await tx.instanceLegalSigner.createMany({
            data: patch.signers.map((signer) => ({
              instanceLegalId: before.id,
              slot: signer.slot,
              name: signer.name,
              title: signer.title,
            })),
          });
        }
      }
      const row = await tx.instanceLegal.update({
        where: { id: before.id },
        data,
        include: { signers: { orderBy: { slot: "asc" } } },
      });
      if (keys.length > 0) {
        await tx.auditLog.create({
          data: {
            adminUserId,
            action: "instance_legal_patch",
            entityType: "instance_legal",
            entityId: row.id,
            ipAddress,
            metadata: { fields: keys },
          },
        });
      }
      return row;
    });
    return this.toView(updated);
  }

  /** Short transaction. The legal row lock is released before Puppeteer runs. */
  reserveFolio(certificateId: string): Promise<number | null> {
    if (this.env.INSTANCE !== "ac3") {
      return Promise.resolve(null);
    }
    return reserveAc3Folio(this.prisma, certificateId);
  }

  captureSnapshot(tx: Prisma.TransactionClient, folio: number, issuedAt: Date): Promise<LegalSnapshot> {
    return captureLegalSnapshot(tx, folio, issuedAt);
  }

  textValues(snapshot: LegalSnapshot): Record<string, string> {
    return legalTextValues(snapshot, false);
  }

  private ensureRow(tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return ensureLegalRow(tx);
  }

  private toView(row: {
    entityName: string;
    nit: string;
    representative: string;
    issueCity: string;
    disclaimer: string;
    lastFolio: number;
    signers: { slot: number; name: string; title: string }[];
  }) {
    return {
      entityName: row.entityName,
      nit: row.nit,
      representative: row.representative,
      issueCity: row.issueCity,
      disclaimer: row.disclaimer,
      lastFolio: row.lastFolio,
      signers: row.signers.map((signer) => ({ slot: signer.slot, name: signer.name, title: signer.title })),
    };
  }
}

export function rejectFolioPatch(body: Record<string, unknown>): void {
  if ("lastFolio" in body || "last_folio" in body) {
    throw new ConflictException({
      statusCode: 409,
      error: "Conflict",
      message: "El folio lo asigna el sistema.",
    });
  }
}
