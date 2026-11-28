import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_DISCLAIMER, LEGAL_ROW_ID, buildLegalSnapshot, nextFolio, type LegalSnapshot } from "./legal-snapshot";

type LegalDb = PrismaService | Prisma.TransactionClient;

export async function reserveAc3Folio(db: PrismaService, certificateId: string): Promise<number | null> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM certificates WHERE id = ${certificateId}::uuid FOR UPDATE`;
    const certificate = await tx.certificate.findUnique({ where: { id: certificateId }, select: { folio: true, status: true } });
    if (!certificate || certificate.status !== "pending") {
      return certificate?.folio ?? null;
    }
    await tx.$executeRaw`SELECT id FROM instance_legal WHERE id = ${LEGAL_ROW_ID}::uuid FOR UPDATE`;
    const legal = await ensureLegalRow(tx);
    const reserved = nextFolio(certificate.folio, legal.lastFolio);
    if (certificate.folio === null) {
      await tx.instanceLegal.update({ where: { id: legal.id }, data: { lastFolio: reserved.lastFolio } });
      await tx.certificate.update({ where: { id: certificateId }, data: { folio: reserved.folio } });
    }
    return reserved.folio;
  });
}

export async function captureLegalSnapshot(tx: Prisma.TransactionClient, folio: number, issuedAt: Date): Promise<LegalSnapshot> {
  const row = await ensureLegalRow(tx);
  return buildLegalSnapshot(
    {
      entityName: row.entityName,
      nit: row.nit,
      representative: row.representative,
      issueCity: row.issueCity,
      disclaimer: row.disclaimer,
      signers: row.signers.map((signer) => ({
        slot: signer.slot,
        name: signer.name,
        title: signer.title,
        signature_storage_key: signer.signatureStorageKey,
      })),
    },
    folio,
    issuedAt,
  );
}

export async function ensureLegalRow(db: LegalDb) {
  const existing = await db.instanceLegal.findUnique({
    where: { id: LEGAL_ROW_ID },
    include: { signers: { orderBy: { slot: "asc" } } },
  });
  if (existing) {
    return existing;
  }
  return db.instanceLegal.create({
    data: { id: LEGAL_ROW_ID, disclaimer: DEFAULT_DISCLAIMER },
    include: { signers: { orderBy: { slot: "asc" } } },
  });
}
