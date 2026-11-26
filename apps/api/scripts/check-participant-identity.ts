import { PrismaClient } from "@prisma/client";
import { formatIdentityRepeats, repeatedIdentities } from "../src/participants/repeated-identities";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const rows = await prisma.participant.findMany({
    where: { erasedAt: null },
    select: {
      id: true,
      fullName: true,
      email: true,
      countryCode: true,
      docTypeCode: true,
      docNumber: true,
      event: { select: { id: true, name: true } },
    },
    orderBy: [{ eventId: "asc" }, { fullName: "asc" }],
  });
  const report = formatIdentityRepeats(
    repeatedIdentities(
      rows.map((row) => ({
        eventId: row.event.id,
        eventName: row.event.name,
        participantId: row.id,
        fullName: row.fullName,
        email: row.email,
        countryCode: row.countryCode?.trim() ?? null,
        docTypeCode: row.docTypeCode,
        docNumber: row.docNumber,
      })),
    ),
  );
  process.stdout.write(report);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "No se pudo leer la base de datos.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
