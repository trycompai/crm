import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { runVisibleLane, VISIBLE_BATCH } from "../../agent/lib/dispatch";
import {
	reasonOf,
	removeAgent,
	removeAgentsNamed,
	removeEventRuns,
} from "./e2e-agents";
import { E2E } from "./e2e-config";

const COUNT = Number(process.env.E2E_LOAD_COUNT ?? E2E.load.defaultCount);
const DRAIN_PASSES = Math.ceil(COUNT / VISIBLE_BATCH) + E2E.load.drainPassSlack;

async function seedAgent() {
	const owner = await db.user.findFirstOrThrow({ select: { id: true } });
	const agent = await db.agentDefinition.create({
		data: {
			name: `${E2E.load.agentPrefix} ${Date.now()}`,
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

async function sweepLeftovers() {
	for (const name of await removeAgentsNamed(E2E.load.agentPrefix)) {
		console.log(`  removed leftover ${name}`);
	}

	const stale = await db.company.findMany({
		where: {
			domain: {
				startsWith: E2E.load.domainPrefix,
				endsWith: E2E.load.domainSuffix,
			},
			name: { startsWith: E2E.load.companyPrefix },
		},
		select: { id: true, name: true },
	});

	for (const company of stale) {
		const deals = await db.deal.findMany({
			where: { companyId: company.id },
			select: { id: true },
		});
		await db.agentTask.deleteMany({
			where: { dealId: { in: deals.map((deal) => deal.id) } },
		});
		await db.deal.deleteMany({ where: { companyId: company.id } });
		await db.company.delete({ where: { id: company.id } });
		console.log(`  removed leftover ${company.name}`);
	}
}

async function cleanUp(
	agentId: string | null,
	companyId: string | null,
	dealIds: string[],
	taskIds: string[],
) {
	await removeEventRuns(taskIds);
	if (agentId) await removeAgent(agentId);
	if (dealIds.length > 0) {
		await db.agentTask.deleteMany({ where: { dealId: { in: dealIds } } });
	}
	if (!companyId) return;
	await db.deal.deleteMany({ where: { companyId } });
	await db.company.delete({ where: { id: companyId } });
}

async function main() {
	await sweepLeftovers();

	const dealIds: string[] = [];
	const taskIds: string[] = [];
	let agentId: string | null = null;
	let companyId: string | null = null;
	let ok = false;

	try {
		const seededAgent = await seedAgent();
		agentId = seededAgent.agentId;
		const owner = await db.user.findFirstOrThrow({ select: { id: true } });
		const company = await db.company.create({
			data: {
				name: `Load Co ${Date.now()}`,
				domain: `load-${Date.now()}.test`,
			},
			select: { id: true },
		});
		companyId = company.id;

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
		dealIds.push(...deals.map((deal) => deal.id));
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
				priority: PRIORITY.event,
				budget: 1,
				dueAt: new Date(),
			})),
		});
		const seeded = await db.agentTask.findMany({
			where: { dealId: { in: dealIds } },
			select: { id: true },
		});
		taskIds.push(...seeded.map((task) => task.id));
		console.log(`  seeded in ${Date.now() - seedStart}ms`);

		console.log("Draining…");
		const drainStart = Date.now();
		let handled = 0;
		for (let pass = 0; pass < DRAIN_PASSES; pass += 1) {
			const done = await runVisibleLane();
			handled += done;
			if (done === 0) break;
		}
		const drainMs = Date.now() - drainStart;

		const queued = await db.agentRun.count({
			where: { agentId: seededAgent.agentId },
		});
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

		ok = handled >= COUNT && leftover === 0 && queued >= COUNT;
	} finally {
		console.log("\nCleaning up…");
		try {
			await cleanUp(agentId, companyId, dealIds, taskIds);
		} catch (error) {
			ok = false;
			console.error(`  cleanup failed — ${reasonOf(error)}`);
		}
	}

	console.log(ok ? "\nPASS  load test" : "\nFAIL  load test");
	process.exit(ok ? 0 : 1);
}

await main();
