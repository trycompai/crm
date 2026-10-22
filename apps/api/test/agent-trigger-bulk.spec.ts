import { describe, expect, it } from "bun:test";
import type { Db, Prisma } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";

function service() {
	const writes: Prisma.AgentTaskCreateManyInput[][] = [];
	const agentTask = {
		createMany: async ({ data }: Prisma.AgentTaskCreateManyArgs) => {
			const rows = Array.isArray(data) ? data : [data];
			writes.push(rows);
			return { count: rows.length };
		},
	};
	const transaction = { agentTask } as unknown as Prisma.TransactionClient;
	const db = {
		agentTask,
		$transaction: async <Result>(
			work: (tx: Prisma.TransactionClient) => Promise<Result>,
		) => work(transaction),
	} as unknown as Db;

	return { trigger: new AgentTriggerService(db), writes };
}

describe("bulk agent task queues", () => {
	it("writes CRM events in one batch", async () => {
		const { trigger, writes } = service();

		await trigger.withCrmEvents(async (_tx, emit) => {
			for (let index = 0; index < 50; index += 1) {
				await emit({
					type: "company.created",
					record: { kind: "company", id: `company-${index}` },
					occurredAt: new Date("2026-10-22T00:00:00.000Z"),
					data: { name: `Company ${index}`, domain: null },
				});
			}
		});

		expect(writes).toHaveLength(1);
		expect(writes[0]).toHaveLength(50);
		expect(writes[0]?.every((row) => row.kind === "agent-event")).toBe(true);
	});

	it("writes new-record field backfills in one batch", async () => {
		const { trigger, writes } = service();
		const ids = Array.from({ length: 50 }, (_, index) => `company-${index}`);

		const result = await trigger.fieldBackfillNewRecords(
			"COMPANY",
			["summary"],
			ids,
			"New record",
		);

		expect(result).toEqual({ queued: 50 });
		expect(writes).toHaveLength(1);
		expect(writes[0]).toHaveLength(50);
		expect(writes[0]?.every((row) => row.kind === "field-backfill")).toBe(true);
	});
});
