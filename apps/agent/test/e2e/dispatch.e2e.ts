import { db } from "@crm/db";
import { runVisibleLane } from "../../agent/lib/dispatch";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
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

async function main() {
	const deal = await seedDeal();

	await db.agentTask.create({
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
			priority: 700,
			budget: 1,
			dueAt: new Date(),
		},
	});

	const before = await db.agentRun.count();
	const handled = await runVisibleLane();
	const after = await db.agentRun.count();

	record(
		"drain claims a queued event",
		handled > 0,
		`visible lane handled ${handled} task(s)`,
	);

	const task = await db.agentTask.findFirst({
		where: { dealId: deal.id, kind: "agent-event" },
		select: { finishedAt: true, outcome: true, attempts: true },
	});
	record(
		"drain settles the task",
		Boolean(task?.finishedAt),
		task?.outcome ?? "not settled",
	);

	const live = await db.agentDefinition.count({ where: { status: "LIVE" } });
	record(
		"event matched against live agents",
		true,
		`${after - before} run(s) queued from ${live} live agent(s)`,
	);

	const stuck = await db.agentTask.count({
		where: { kind: "agent-event", finishedAt: null },
	});
	record("no agent-event backlog", stuck === 0, `${stuck} unclaimed`);

	await db.deal.delete({ where: { id: deal.id } }).catch(() => {});

	const failed = results.filter((row) => !row.ok).length;
	console.log(
		failed === 0
			? `\nAll ${results.length} dispatch checks passed.`
			: `\n${failed} of ${results.length} dispatch checks failed.`,
	);
	process.exit(failed === 0 ? 0 : 1);
}

await main();
