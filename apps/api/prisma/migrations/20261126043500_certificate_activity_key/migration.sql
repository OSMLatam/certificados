-- One live certificate per participant, role, and activity. An empty key is "no activity".
ALTER TABLE "certificates" ADD COLUMN "activity_key" TEXT NOT NULL DEFAULT '';

UPDATE "certificates"
SET "activity_key" = lower(
  regexp_replace(
    btrim(
      translate(
        coalesce("activity_title", ''),
        'ÁÀÂÄÃáàâäãÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇç',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'
      )
    ),
    '\s+',
    ' ',
    'g'
  )
);

DROP INDEX "certificates_participant_role_active";

CREATE UNIQUE INDEX "certificates_participant_role_activity_active"
ON "certificates" ("participant_id", "role_code", "activity_key")
WHERE "status" <> 'revoked';
