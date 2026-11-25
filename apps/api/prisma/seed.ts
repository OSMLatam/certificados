import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, DocNormalize } from "@prisma/client";
import { parse } from "yaml";
import { isNormalizeStrategy } from "@certificados/shared";

const prisma = new PrismaClient();

type RoleSeed = {
  code: string;
  label: string;
  display_order: number;
};

type CountrySeed = {
  country_code: string;
  document_types: Array<{
    code: string;
    label: string;
    normalize: string;
    validation_regex?: string;
    display_order: number;
  }>;
};

function readYaml<T>(relativeFromRepo: string): T {
  const file = path.resolve(__dirname, "../../..", relativeFromRepo);
  return parse(readFileSync(file, "utf8")) as T;
}

async function seedRoles(): Promise<void> {
  const doc = readYaml<{ roles: RoleSeed[] }>("docs/anexos/seed/roles.yaml");
  for (const role of doc.roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { label: role.label, displayOrder: role.display_order, isActive: true },
      create: {
        code: role.code,
        label: role.label,
        displayOrder: role.display_order,
        isActive: true,
      },
    });
  }
}

async function seedCountryIdentity(): Promise<void> {
  const doc = readYaml<CountrySeed>("docs/anexos/seed/country-identity-co.yaml");
  for (const docType of doc.document_types) {
    if (!isNormalizeStrategy(docType.normalize)) {
      throw new Error(
        `Invalid normalize "${docType.normalize}" for ${doc.country_code}/${docType.code}`,
      );
    }
    await prisma.countryIdentityConfig.upsert({
      where: {
        countryCode_docTypeCode: {
          countryCode: doc.country_code,
          docTypeCode: docType.code,
        },
      },
      update: {
        docTypeLabel: docType.label,
        normalize: docType.normalize as DocNormalize,
        validationRegex: docType.validation_regex ?? null,
        displayOrder: docType.display_order,
      },
      create: {
        countryCode: doc.country_code,
        docTypeCode: docType.code,
        docTypeLabel: docType.label,
        normalize: docType.normalize as DocNormalize,
        validationRegex: docType.validation_regex ?? null,
        displayOrder: docType.display_order,
      },
    });
  }
}

async function main(): Promise<void> {
  await seedRoles();
  await seedCountryIdentity();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
