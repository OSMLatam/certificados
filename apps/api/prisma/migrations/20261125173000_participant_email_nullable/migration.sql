-- AlterTable
ALTER TABLE "participants" ALTER COLUMN "email" DROP NOT NULL;

-- Without an email, one document identifies one participant in the event.
-- Rows that have an email stay unique on (event_id, email); NULL emails do not collide.
CREATE UNIQUE INDEX "participants_event_document_without_email_key"
ON "participants" ("event_id", "country_code", "doc_type_code", "doc_number")
WHERE "email" IS NULL
  AND "country_code" IS NOT NULL
  AND "doc_type_code" IS NOT NULL
  AND "doc_number" IS NOT NULL;
