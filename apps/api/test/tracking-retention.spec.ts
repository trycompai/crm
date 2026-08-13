import { describe, expect, it } from "bun:test";
import { MARKETING } from "@crm/db/marketing";
import { TrackingRetentionController } from "../src/tracking/tracking.controller";

const SECRET = "retention-secret";

type Args = ConstructorParameters<typeof TrackingRetentionController>;

function controllerWith(staleMarketingEvents: number) {
	let left = staleMarketingEvents;

	const db = {
		$executeRaw: async () => 0,
		marketingEvent: {
			findMany: async ({ take }: { take: number }) => {
				const size = Math.min(take, left);
				return Array.from({ length: size }, (_, index) => ({
					id: `event-${index}`,
				}));
			},
			deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
				const count = where.id.in.length;
				left -= count;
				return { count };
			},
		},
	} as unknown as Args[0];

	const rollups = { run: async () => 0 } as unknown as Args[1];
	const counters = { sweep: async () => 0 } as unknown as Args[2];
	const config = { get: () => SECRET } as unknown as Args[3];

	return new TrackingRetentionController(db, rollups, counters, config);
}

describe("Tracking retention", () => {
	it("sweeps every stale marketing event and reports a complete sweep", async () => {
		const controller = controllerWith(3);

		const result = await controller.viaPost(`Bearer ${SECRET}`);

		expect(result.marketingEvents).toBe(3);
		expect(result.marketingEventsComplete).toBe(true);
	});

	it("stops at the marketing pass limit and says the sweep is incomplete", async () => {
		const controller = controllerWith(Number.MAX_SAFE_INTEGER);

		const result = await controller.viaPost(`Bearer ${SECRET}`);

		expect(result.marketingEvents).toBe(
			MARKETING.retention.batch * MARKETING.retention.maxPasses,
		);
		expect(result.marketingEventsComplete).toBe(false);
	});
});
