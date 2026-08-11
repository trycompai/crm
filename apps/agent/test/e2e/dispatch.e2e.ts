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
	const company = await db.company.create({
		data: { name: `E2E Co ${Date.now()}`, domain: `e2e-${Date.now()}.test` },
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

async function cleanUp(seed: {
	agentId: string;
	companyId: string;
	dealId: string;
	taskId: string;
}) {
	await removeEventRuns([seed.taskId]);
	await removeAgent(seed.agentId);
	await db.agentTask.deleteMany({ where: { dealId: seed.dealId } });
	await db.deal.delete({ where: { id: seed.dealId } });
	await db.company.delete({ where: { id: seed.companyId } });
}

async function main() {
	for (const name of await removeAgentsNamed(E2E.dispatch.agentPrefix)) {
		console.log(`  removed leftover ${name}`);
	}

	const { agentId } = await seedAgent();
	const deal = await seedDeal();
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

	try {
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
		const failure = await cleanUp({
			agentId,
			companyId: deal.companyId,
			dealId: deal.id,
			taskId: task.id,
		}).then(
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
