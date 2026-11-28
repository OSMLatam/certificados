import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { createPermalinkSlug } from "@certificados/shared";

type BadgeClassWriter = {
  role: Prisma.TransactionClient["role"];
  badgeClass: Prisma.TransactionClient["badgeClass"];
};

/** One class per event role. The code stays put if the event is renamed; the visible name follows the event. */
export async function syncEventRoleClasses(
  db: BadgeClassWriter,
  event: { id: string; name: string; allowedRoles: string[] },
): Promise<void> {
  const roles = await db.role.findMany({ where: { code: { in: event.allowedRoles } } });
  const labels = new Map(roles.map((role) => [role.code, role.label]));
  for (const roleCode of event.allowedRoles) {
    const label = labels.get(roleCode) ?? roleCode;
    const code = eventRoleClassCode(event.id, roleCode);
    const name = `${label} — ${event.name}`;
    const description = `Certificado de ${label} en ${event.name}.`;
    const criteriaNarrative = `La persona tiene un certificado de ${label} en el evento.`;
    const existing = await db.badgeClass.findUnique({ where: { code } });
    if (!existing) {
      await db.badgeClass.create({
        data: {
          code,
          type: "event_role",
          name,
          description,
          criteriaNarrative,
          externalSource: "certificate_sync",
          eventId: event.id,
          roleCode,
        },
      });
      continue;
    }
    if (existing.code !== code) {
      continue;
    }
    if (existing.name !== name || existing.description !== description || existing.criteriaNarrative !== criteriaNarrative) {
      await db.badgeClass.update({
        where: { id: existing.id },
        data: { name, description, criteriaNarrative },
      });
    }
  }
}

export function eventRoleClassCode(eventId: string, roleCode: string): string {
  return `event-role:${eventId}:${roleCode}`;
}

export async function ensureEventRoleBadge(tx: Prisma.TransactionClient, certificateId: string): Promise<void> {
  const certificate = await tx.certificate.findUnique({
    where: { id: certificateId },
    include: { participant: true, event: true },
  });
  if (!certificate) {
    return;
  }
  const existing = await tx.badgeAssertion.findUnique({ where: { certificateId } });
  if (existing) {
    return;
  }
  const role = await tx.role.findUnique({ where: { code: certificate.roleCode } });
  const label = role?.label ?? certificate.roleCode;
  const code = eventRoleClassCode(certificate.eventId, certificate.roleCode);
  let badgeClass = await tx.badgeClass.findUnique({ where: { code } });
  if (!badgeClass) {
    badgeClass = await tx.badgeClass.create({
      data: {
        code,
        type: "event_role",
        name: `${label} — ${certificate.event.name}`,
        description: `Certificado de ${label} en ${certificate.event.name}.`,
        criteriaNarrative: `La persona tiene un certificado de ${label} en el evento.`,
        externalSource: "certificate_sync",
        eventId: certificate.eventId,
        roleCode: certificate.roleCode,
      },
    });
  }
  await tx.badgeAssertion.create({
    data: {
      badgeClassId: badgeClass.id,
      certificateId,
      recipientName: certificate.participant.fullName,
      recipientSalt: randomBytes(16).toString("hex"),
      status: "pending",
      slug: createPermalinkSlug(),
    },
  });
}

export async function markEventRoleBadgeIssued(
  tx: Prisma.TransactionClient,
  certificateId: string,
  issuedAt: Date,
): Promise<void> {
  await tx.badgeAssertion.updateMany({
    where: { certificateId, status: { not: "revoked" } },
    data: { status: "issued", issuedAt, assertionJson: Prisma.DbNull },
  });
}

export async function revokeBadgeOnly(
  db: Pick<Prisma.TransactionClient, "badgeAssertion">,
  id: string,
  reason: string,
  when: Date,
): Promise<boolean> {
  const assertion = await db.badgeAssertion.findUnique({ where: { id } });
  if (!assertion || assertion.status === "revoked") {
    return false;
  }
  await db.badgeAssertion.update({
    where: { id },
    data: {
      status: "revoked",
      revokedAt: when,
      revokeReason: reason || null,
      assertionJson: Prisma.DbNull,
    },
  });
  return true;
}

export async function revokeEventRoleBadge(
  tx: Prisma.TransactionClient,
  certificateId: string,
  reason: string,
  when: Date,
): Promise<void> {
  await tx.badgeAssertion.updateMany({
    where: { certificateId, status: { not: "revoked" } },
    data: {
      status: "revoked",
      revokedAt: when,
      revokeReason: reason || null,
      assertionJson: Prisma.DbNull,
    },
  });
}

