-- Deleting an event removes its badge classes. Assertions are already gone with their certificates.
ALTER TABLE "badge_classes" DROP CONSTRAINT "badge_classes_event_id_fkey";
ALTER TABLE "badge_classes" ADD CONSTRAINT "badge_classes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
