import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { runVisibleLane } from "../../agent/lib/dispatch";
import {
	reasonOf,
	removeAgent,
	removeAgentsNamed,
	removeEventRuns,
} from "./e2e-agents";
import { E2E } from "./e2e-config";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function seedAgent() {
	const owner = await db.user.findFirstOrThrow({ select: { id: true } });
	const agent = await db.agentDefinition.create({
		data: {
			name: `${E2E.dispatch.agentPrefix} ${Date.now()}`,
			description: "Seeded by the dispatch E2E. Safe to delete.",
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
			instructions: "Dispatch test agent. Does nothing.",
			modelId: "test/model",
			sandboxPolicy: {},
			createdById: owner.id,
			manifest: {
				description: "dispatch test",
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
	return { agentId: agent.id };
}

async function seedDeal() {
	const stamp = Date.now();
	const company = await db.company.create({
		data: {
			name: `${E2E.dispatch.companyPrefix} ${stamp}`,
			domain: `${E2E.dispatch.domainPrefix}${stamp}${E2E.dispatch.domainSuffix}`,
		},
		select: { id: true },
	});
	const owner = await db.user.findFirstOrThrow({ select: { id: true } });
	return db.deal.create({
		data: {
			name: `E2E Deal ${Date.now()}`,
			companyId: company.id,
			ownerId: owner.id,
			stage: "DEMO_BOOKED",
			stageChangedAt: new Date(),
		},
		select: { id: true, companyId: true },
	});
}

async function sweepLeftovers() {
	for (const name of await removeAgentsNamed(E2E.dispatch.agentPrefix)) {
		console.log(`  removed leftover ${name}`);
	}

	const stale = await db.company.findMany({
		where: {
			domain: {
				startsWith: E2E.dispatch.domainPrefix,
				endsWith: E2E.dispatch.domainSuffix,
			},
			name: { startsWith: E2E.dispatch.companyPrefix },
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
	dealId: string | null,
	taskId: string | null,
) {
	await removeEventRuns(taskId ? [taskId] : []);
	if (agentId) await removeAgent(agentId);
	if (dealId) await db.agentTask.deleteMany({ where: { dealId } });
	if (!companyId) return;
	await db.deal.deleteMany({ where: { companyId } });
	await db.company.delete({ where: { id: companyId } });
}

async function main() {
	await sweepLeftovers();

	let agentId: string | null = null;
	let companyId: string | null = null;
	let dealId: string | null = null;
	let taskId: string | null = null;

	try {
		const seededAgent = await seedAgent();
		agentId = seededAgent.agentId;
		const deal = await seedDeal();
		companyId = deal.companyId;
		dealId = deal.id;
		const task = await db.agentTask.create({
			data: {
				dealId: deal.id,
				kind: "agent-event",
				reason: "deal.created",
				payload: {
					type: "deal.created",
					record: { kind: "deal", id: deal.id },
					occurredAt: new Date().toISOString(),
					data: { companyId: deal.companyId, stage: "DEMO_BOOKED" },
				},
				priority: PRIORITY.event,
				budget: 1,
				dueAt: new Date(),
			},
			select: { id: true },
		});
		taskId = task.id;

		const before = await db.agentRun.count();
		const handled = await runVisibleLane();
		const after = await db.agentRun.count();

		record(
			"drain claims a queued event",
			handled > 0,
			`visible lane handled ${handled} task(s)`,
		);

		const settled = await db.agentTask.findUnique({
			where: { id: task.id },
			select: { finishedAt: true, outcome: true },
		});
		record(
			"drain settles the task",
			Boolean(settled?.finishedAt),
			settled?.outcome ?? "not settled",
		);

		const live = await db.agentDefinition.count({ where: { status: "LIVE" } });
		record(
			"event matched against live agents",
			after > before,
			`${after - before} run(s) queued from ${live} live agent(s)`,
		);

		const stuck = await db.agentTask.count({
			where: { kind: "agent-event", finishedAt: null },
		});
		record("no agent-event backlog", stuck === 0, `${stuck} unclaimed`);
	} finally {
		const failure = await cleanUp(agentId, companyId, dealId, taskId).then(
			() => null,
			(error: unknown) => reasonOf(error),
		);
		record(
			"cleanup leaves no seeded rows",
			failure === null,
			failure ?? "agent, run, task, deal and company removed",
		);
	}

	const failed = results.filter((row) => !row.ok).length;
	console.log(
		failed === 0
			? `\nAll ${results.length} dispatch checks passed.`
			: `\n${failed} of ${results.length} dispatch checks failed.`,
	);
	process.exit(failed === 0 ? 0 : 1);
}

await main();
