import { db } from "@crm/db";
import { runVisibleLane } from "../../agent/lib/dispatch";

const COUNT = Number(process.env.E2E_LOAD_COUNT ?? 300);

async function seedAgent() {
	const owner = await db.user.findFirstOrThrow({ select: { id: true } });
	const agent = await db.agentDefinition.create({
		data: {
			name: `E2E Load Agent ${Date.now()}`,
			description: "Seeded for load testing. Safe to delete.",
			status: "LIVE",
			createdById: owner.id,
		},
		select: { id: true },
	});
	const version = await db.agentVersion.create({
		data: {
			agentId: agent.id,
			number: 1,
			status: "DEPLOYED",
			instructions: "Load test agent. Does nothing.",
			modelId: "test/model",
			sandboxPolicy: {},
			createdById: owner.id,
			manifest: {
				description: "load test",
				triggers: [
					{
						type: "EVENT",
						name: "Deal created",
						summary: "Fires on deal creation",
						config: { event: "deal.created" },
					},
				],
				dataScope: { mode: "WORKSPACE", summary: "Workspace", resources: [] },
				actions: [
					{ type: "run.summary", provider: "crm", summary: "Log the result" },
				],
			},
		},
		select: { id: true },
	});
	await db.agentDefinition.update({
		where: { id: agent.id },
		data: { currentVersionId: version.id },
	});
	await db.agentTrigger.create({
		data: {
			agentId: agent.id,
			versionId: version.id,
			type: "EVENT",
			name: "Deal created",
			config: { event: "deal.created" },
			enabled: true,
			createdById: owner.id,
		},
	});
	return { agentId: agent.id, versionId: version.id };
}

async function main() {
	const { agentId } = await seedAgent();
	const owner = await db.user.findFirstOrThrow({ select: { id: true } });
	const company = await db.company.create({
		data: { name: `Load Co ${Date.now()}`, domain: `load-${Date.now()}.test` },
		select: { id: true },
	});

	console.log(`Seeding ${COUNT} deal.created events…`);
	const seedStart = Date.now();
	const deals = await db.$transaction(
		Array.from({ length: COUNT }, (_, index) =>
			db.deal.create({
				data: {
					name: `Load Deal ${index}`,
					companyId: company.id,
					ownerId: owner.id,
					stage: "DEMO_BOOKED",
					stageChangedAt: new Date(),
				},
				select: { id: true },
			}),
		),
	);
	await db.agentTask.createMany({
		data: deals.map((deal) => ({
			dealId: deal.id,
			kind: "agent-event" as const,
			reason: "deal.created",
			payload: {
				type: "deal.created",
				record: { kind: "deal", id: deal.id },
				occurredAt: new Date().toISOString(),
				data: { companyId: company.id, stage: "DEMO_BOOKED" },
			},
			priority: 700,
			budget: 1,
			dueAt: new Date(),
		})),
	});
	console.log(`  seeded in ${Date.now() - seedStart}ms`);

	console.log("Draining…");
	const drainStart = Date.now();
	let handled = 0;
	for (let pass = 0; pass < 40; pass += 1) {
		const done = await runVisibleLane();
		handled += done;
		if (done === 0) break;
	}
	const drainMs = Date.now() - drainStart;

	const queued = await db.agentRun.count({ where: { agentId } });
	const leftover = await db.agentTask.count({
		where: { kind: "agent-event", finishedAt: null },
	});

	console.log(`\n  tasks drained     ${handled}`);
	console.log(`  runs queued       ${queued}`);
	console.log(`  unclaimed left    ${leftover}`);
	console.log(`  drain time        ${drainMs}ms`);
	console.log(
		`  throughput        ${Math.round((handled / drainMs) * 1000)}/s`,
	);

	console.log("\nCleaning up…");
	await db.agentRunEvent.deleteMany({ where: { run: { agentId } } });
	await db.agentAction.deleteMany({ where: { agentId } });
	await db.agentAuditEvent.deleteMany({ where: { agentId } });
	await db.agentRun.deleteMany({ where: { agentId } });
	await db.agentTrigger.deleteMany({ where: { agentId } });
	await db.agentDefinition.update({
		where: { id: agentId },
		data: { currentVersionId: null },
	});
	await db.agentVersion.deleteMany({ where: { agentId } });
	await db.agentDefinition.delete({ where: { id: agentId } });
	await db.deal.deleteMany({ where: { companyId: company.id } });
	await db.company.delete({ where: { id: company.id } });

	const ok = handled >= COUNT && leftover === 0 && queued >= COUNT;
	console.log(ok ? "\nPASS  load test" : "\nFAIL  load test");
	process.exit(ok ? 0 : 1);
}

await main();
