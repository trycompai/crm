import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";

const suffix = crypto.randomUUID();
const iCalUid = `shared-${suffix}@example.test`;
const originalStartTime = new Date("2026-08-12T10:00:00.000Z");
const ids = [`calendar-u1-${suffix}`, `calendar-u2-${suffix}`];

afterAll(async () => {
	await db.calendarEvent.deleteMany({ where: { id: { in: ids } } });
});

describe("calendar event ownership", () => {
	it("stores the same provider event independently for each syncing user", async () => {
		await db.calendarEvent.createMany({
			data: ids.map((id, index) => ({
				id,
				iCalUid,
				originalStartTime,
				startsAt: originalStartTime,
				endsAt: new Date(originalStartTime.getTime() + 30 * 60 * 1000),
				status: "confirmed",
				syncedByUserId: `calendar-owner-${index}-${suffix}`,
			})),
		});

		expect(
			await db.calendarEvent.count({
				where: { id: { in: ids }, iCalUid, originalStartTime },
			}),
		).toBe(2);
	});
});
