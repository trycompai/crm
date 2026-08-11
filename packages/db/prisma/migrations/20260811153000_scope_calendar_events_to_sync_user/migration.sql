CREATE UNIQUE INDEX "calendarEvent_syncedByUserId_iCalUid_originalStartTime_key"
ON "calendarEvent"("syncedByUserId", "iCalUid", "originalStartTime");
