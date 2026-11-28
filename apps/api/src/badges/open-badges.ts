import { createHash } from "node:crypto";

export type BadgeJson = Record<string, unknown>;

export function badgeIdentity(email: string | null, salt: string, fallback: string): { identity: string; salt: string } {
  const subject = email && email.length > 0 ? email : fallback;
  const digest = createHash("sha256").update(`${subject}${salt}`).digest("hex");
  return { identity: `sha256$${digest}`, salt };
}

export function assertionDocument(input: {
  baseUrl: string;
  uuid: string;
  classId: string;
  email: string | null;
  salt: string;
  fallbackId: string;
  issuedOn: string | null;
  evidenceUrl: string | null;
  revoked: boolean;
  revocationReason: string | null;
}): BadgeJson {
  const base = input.baseUrl.replace(/\/$/, "");
  const identity = badgeIdentity(input.email, input.salt, input.fallbackId);
  const document: BadgeJson = {
    "@context": "https://w3id.org/openbadges/v2",
    type: "Assertion",
    id: `${base}/badges/assertions/${input.uuid}.json`,
    recipient: {
      type: "email",
      hashed: true,
      salt: identity.salt,
      identity: identity.identity,
    },
    badge: `${base}/badges/classes/${input.classId}.json`,
    verification: { type: "hosted" },
    issuedOn: input.issuedOn,
  };
  if (input.evidenceUrl) {
    document.evidence = [{ id: input.evidenceUrl, name: "Certificado" }];
  }
  if (input.revoked) {
    document.revoked = true;
    document.revocationReason = input.revocationReason ?? "";
  }
  return document;
}

export function badgeClassDocument(input: {
  baseUrl: string;
  classId: string;
  name: string;
  description: string;
  criteria: string;
  image: string;
}): BadgeJson {
  const base = input.baseUrl.replace(/\/$/, "");
  return {
    "@context": "https://w3id.org/openbadges/v2",
    type: "BadgeClass",
    id: `${base}/badges/classes/${input.classId}.json`,
    name: input.name,
    description: input.description,
    image: input.image,
    criteria: { narrative: input.criteria },
    issuer: `${base}/badges/issuer.json`,
  };
}

export function issuerDocument(input: { baseUrl: string; name: string; email: string; description: string }): BadgeJson {
  const base = input.baseUrl.replace(/\/$/, "");
  return {
    "@context": "https://w3id.org/openbadges/v2",
    type: "Issuer",
    id: `${base}/badges/issuer.json`,
    name: input.name,
    url: base,
    email: input.email,
    description: input.description,
    revocationList: `${base}/badges/revocations.json`,
  };
}

export function revocationsDocument(input: { items: { uuid: string; reason: string | null }[]; baseUrl: string }): BadgeJson {
  const base = input.baseUrl.replace(/\/$/, "");
  return {
    "@context": "https://w3id.org/openbadges/v2",
    type: "RevocationList",
    id: `${base}/badges/revocations.json`,
    issuer: `${base}/badges/issuer.json`,
    revokedAssertions: input.items.map((item) => ({
      id: `${base}/badges/assertions/${item.uuid}.json`,
      revocationReason: item.reason ?? "",
    })),
  };
}
