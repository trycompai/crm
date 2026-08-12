ALTER TABLE "calendarEvent"
ADD COLUMN "providerICalUid" TEXT;

UPDATE "calendarEvent"
SET
    "providerICalUid" = "iCalUid",
    "iCalUid" = 'legacy:' || "id";

ALTER TABLE "calendarEvent"
ALTER COLUMN "providerICalUid" SET NOT NULL;

CREATE UNIQUE INDEX "calendarEvent_syncedByUserId_iCalUid_originalStartTime_key"
ON "calendarEvent"("syncedByUserId", "providerICalUid", "originalStartTime");
