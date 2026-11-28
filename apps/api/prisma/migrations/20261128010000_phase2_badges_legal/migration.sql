-- Open Badges 2.0 (hosted) and the AC3 legal snapshot.

CREATE TYPE "badge_type" AS ENUM ('event_role', 'osm_activity');
CREATE TYPE "badge_external_source" AS ENUM ('manual_import', 'osm_api', 'certificate_sync', 'custom');
CREATE TYPE "badge_status" AS ENUM ('pending', 'issued', 'revoked');

CREATE TABLE "badge_issuers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "url" VARCHAR(500) NOT NULL,
  "email" VARCHAR(255),
  "description" TEXT,
  "image_storage_key" VARCHAR(500),
  "public_key" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "badge_issuers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "badge_classes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(120) NOT NULL,
  "type" "badge_type" NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL,
  "criteria_narrative" TEXT NOT NULL,
  "external_source" "badge_external_source" NOT NULL,
  "image_storage_key" VARCHAR(500),
  "event_id" UUID,
  "role_code" VARCHAR(50),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "badge_classes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "badge_classes_code_key" ON "badge_classes"("code");
CREATE INDEX "badge_classes_event_id_role_code_idx" ON "badge_classes"("event_id", "role_code");
CREATE UNIQUE INDEX "badge_classes_event_role" ON "badge_classes"("event_id", "role_code") WHERE "type" = 'event_role';

ALTER TABLE "badge_classes" ADD CONSTRAINT "badge_classes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "badge_assertions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" VARCHAR(16) NOT NULL,
  "badge_class_id" UUID NOT NULL,
  "certificate_id" UUID,
  "osm_profile_id" UUID,
  "recipient_name" VARCHAR(255) NOT NULL,
  "recipient_salt" VARCHAR(64) NOT NULL,
  "status" "badge_status" NOT NULL DEFAULT 'pending',
  "issued_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "revoke_reason" TEXT,
  "assertion_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "badge_assertions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "badge_assertions_uuid_key" ON "badge_assertions"("uuid");
CREATE UNIQUE INDEX "badge_assertions_slug_key" ON "badge_assertions"("slug");
CREATE UNIQUE INDEX "badge_assertions_certificate_id_key" ON "badge_assertions"("certificate_id");
CREATE INDEX "badge_assertions_badge_class_id_idx" ON "badge_assertions"("badge_class_id");
CREATE UNIQUE INDEX "badge_assertions_class_certificate" ON "badge_assertions"("badge_class_id", "certificate_id") WHERE "certificate_id" IS NOT NULL;
CREATE UNIQUE INDEX "badge_assertions_class_osm_profile_active" ON "badge_assertions"("badge_class_id", "osm_profile_id") WHERE "osm_profile_id" IS NOT NULL AND "status" <> 'revoked';

ALTER TABLE "badge_assertions" ADD CONSTRAINT "badge_assertions_badge_class_id_fkey" FOREIGN KEY ("badge_class_id") REFERENCES "badge_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_assertions" ADD CONSTRAINT "badge_assertions_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "instance_legal" (
  "id" UUID NOT NULL,
  "entity_name" VARCHAR(255) NOT NULL DEFAULT '',
  "nit" VARCHAR(50) NOT NULL DEFAULT '',
  "representative" VARCHAR(255) NOT NULL DEFAULT '',
  "issue_city" VARCHAR(255) NOT NULL DEFAULT '',
  "disclaimer" VARCHAR(500) NOT NULL,
  "last_folio" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" UUID,
  CONSTRAINT "instance_legal_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "instance_legal" ADD CONSTRAINT "instance_legal_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "instance_legal" ("id", "disclaimer")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Este documento certifica la participación en la actividad indicada. No constituye título profesional, grado académico ni habilitación legal.'
);

CREATE TABLE "instance_legal_signers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "instance_legal_id" UUID NOT NULL,
  "slot" INTEGER NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "signature_storage_key" VARCHAR(500),
  CONSTRAINT "instance_legal_signers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instance_legal_signers_slot_range" CHECK ("slot" >= 1 AND "slot" <= 8)
);

CREATE UNIQUE INDEX "instance_legal_signers_instance_legal_id_slot_key" ON "instance_legal_signers"("instance_legal_id", "slot");

ALTER TABLE "instance_legal_signers" ADD CONSTRAINT "instance_legal_signers_instance_legal_id_fkey" FOREIGN KEY ("instance_legal_id") REFERENCES "instance_legal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "certificates_folio_present" ON "certificates"("folio") WHERE "folio" IS NOT NULL;
