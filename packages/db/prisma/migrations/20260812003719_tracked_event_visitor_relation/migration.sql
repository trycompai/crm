LOCK TABLE "trackedEvent", "trackedVisitor" IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO "trackedVisitor" ("id", "firstSeen", "lastSeen")
SELECT
    "trackedEvent"."visitorId",
    MIN("trackedEvent"."occurredAt"),
    MAX("trackedEvent"."occurredAt")
FROM "trackedEvent"
WHERE NOT EXISTS (
    SELECT 1
    FROM "trackedVisitor"
    WHERE "trackedVisitor"."id" = "trackedEvent"."visitorId"
)
GROUP BY "trackedEvent"."visitorId"
ON CONFLICT ("id") DO NOTHING;

-- AddForeignKey
ALTER TABLE "trackedEvent" ADD CONSTRAINT "trackedEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "trackedVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
