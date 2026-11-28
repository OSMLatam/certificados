import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { assertionDocument, badgeClassDocument, issuerDocument, revocationsDocument, type BadgeJson } from "./open-badges";

type BadgeDb = PrismaService | Prisma.TransactionClient;

export async function issuerJson(db: BadgeDb, baseUrl: string, name: string, email: string): Promise<BadgeJson> {
  await ensureIssuer(db, name, baseUrl, email);
  return issuerDocument({
    baseUrl,
    name,
    email,
    description: `Insignias de ${name}.`,
  });
}

export async function revocationsJson(db: BadgeDb, baseUrl: string): Promise<BadgeJson> {
  const rows = await db.badgeAssertion.findMany({
    where: { status: "revoked" },
    select: { uuid: true, revokeReason: true },
    orderBy: { revokedAt: "asc" },
  });
  return revocationsDocument({
    baseUrl,
    items: rows.map((row) => ({ uuid: row.uuid, reason: row.revokeReason })),
  });
}

export async function classJson(db: BadgeDb, baseUrl: string, classId: string, image: string): Promise<BadgeJson | null> {
  const badgeClass = await db.badgeClass.findUnique({ where: { id: classId } });
  if (!badgeClass) {
    return null;
  }
  return badgeClassDocument({
    baseUrl,
    classId: badgeClass.id,
    name: badgeClass.name,
    description: badgeClass.description,
    criteria: badgeClass.criteriaNarrative,
    image,
  });
}

export async function assertionJson(db: BadgeDb, baseUrl: string, uuid: string): Promise<BadgeJson | null> {
  const assertion = await db.badgeAssertion.findUnique({
    where: { uuid },
    include: { certificate: { include: { participant: true } }, badgeClass: true },
  });
  if (!assertion) {
    return null;
  }
  if (assertion.assertionJson && typeof assertion.assertionJson === "object") {
    return assertion.assertionJson as BadgeJson;
  }
  const document = assertionDocument({
    baseUrl,
    uuid: assertion.uuid,
    classId: assertion.badgeClassId,
    email: assertion.certificate?.participant.email ?? null,
    salt: assertion.recipientSalt,
    fallbackId: assertion.certificateId ?? assertion.id,
    issuedOn: assertion.issuedAt ? assertion.issuedAt.toISOString() : assertion.createdAt.toISOString(),
    evidenceUrl: assertion.certificate ? `${baseUrl.replace(/\/$/, "")}/c/${assertion.certificate.slug}` : null,
    revoked: assertion.status === "revoked",
    revocationReason: assertion.revokeReason,
  });
  await db.badgeAssertion.update({
    where: { id: assertion.id },
    data: { assertionJson: document as Prisma.InputJsonValue },
  });
  return document;
}

export type PublicBadge = {
  slug: string;
  status: "pending" | "issued" | "revoked";
  recipientName: string | null;
  className: string;
  issuerName: string;
  issuedAt: string | null;
  evidencePermalink: string | null;
  assertionUrl: string;
  revokedAt: string | null;
};

/** Reading a badge never issues the linked certificate. */
export async function publicBadge(db: BadgeDb, baseUrl: string, slug: string, issuerName: string): Promise<PublicBadge | null> {
  const assertion = await db.badgeAssertion.findUnique({
    where: { slug },
    include: { certificate: true, badgeClass: true },
  });
  if (!assertion) {
    return null;
  }
  const revoked = assertion.status === "revoked";
  const base = baseUrl.replace(/\/$/, "");
  return {
    slug: assertion.slug,
    status: assertion.status,
    recipientName: revoked ? null : assertion.recipientName,
    className: assertion.badgeClass.name,
    issuerName,
    issuedAt: assertion.issuedAt ? assertion.issuedAt.toISOString() : null,
    evidencePermalink: assertion.certificate ? `${base}/c/${assertion.certificate.slug}` : null,
    assertionUrl: `${base}/badges/assertions/${assertion.uuid}.json`,
    revokedAt: revoked && assertion.revokedAt ? assertion.revokedAt.toISOString() : null,
  };
}

export async function verifyCertificate(db: BadgeDb, baseUrl: string, slug: string) {
  const certificate = await db.certificate.findUnique({
    where: { slug },
    include: { storedFile: true },
  });
  if (!certificate) {
    return null;
  }
  const issued = certificate.status === "issued";
  return {
    valid: issued,
    status: certificate.status,
    issued_at: issued && certificate.issuedAt ? certificate.issuedAt.toISOString() : null,
    checksum_sha256: issued ? certificate.storedFile?.checksumSha256.trim() ?? null : null,
    permalink: `${baseUrl.replace(/\/$/, "")}/c/${certificate.slug}`,
  };
}

export async function verifyBadge(db: BadgeDb, baseUrl: string, slug: string) {
  const assertion = await db.badgeAssertion.findUnique({ where: { slug } });
  if (!assertion) {
    return null;
  }
  const issued = assertion.status === "issued";
  return {
    valid: issued,
    status: assertion.status,
    issued_at: issued && assertion.issuedAt ? assertion.issuedAt.toISOString() : null,
    revoked: assertion.status === "revoked",
    permalink: `${baseUrl.replace(/\/$/, "")}/b/${assertion.slug}`,
  };
}

async function ensureIssuer(db: BadgeDb, name: string, url: string, email: string): Promise<void> {
  const existing = await db.badgeIssuer.findFirst();
  if (existing) {
    return;
  }
  await db.badgeIssuer.create({
    data: { name, url, email, description: `Insignias de ${name}.` },
  });
}
