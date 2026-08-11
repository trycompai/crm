import { db } from "@crm/db";
import { MAX_ATTEMPTS, RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { retireAbandoned } from "../../agent/lib/dispatch";
import { claimDue } from "../../agent/lib/tasks";
import { reasonOf } from "./e2e-agents";
import { E2E } from "./e2e-config";

type HeldTask = { id: string; leasedUntil: Date | null };

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function claimMine() {
	return claimDue(
		E2E.retry.claimLimit,
		{ only: [E2E.retry.kind] },
		E2E.retry.leaseMs,
	);
}

async function expireLease(taskId: string) {
	await db.agentTask.update({
		where: { id: taskId },
		data: { leasedUntil: new Date(Date.now() - E2E.retry.expiredLeaseMs) },
	});
}

async function holdBackOtherExhausted(taskId: string): Promise<HeldTask[]> {
	const now = new Date();
	const others = await db.agentTask.findMany({
		where: {
			id: { not: taskId },
			finishedAt: null,
			attempts: { gte: MAX_ATTEMPTS },
			OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }],
		},
		select: { id: true, leasedUntil: true },
	});

	if (others.length === 0) return [];

	await db.agentTask.updateMany({
		where: { id: { in: others.map((row) => row.id) } },
		data: { leasedUntil: new Date(Date.now() + E2E.retry.holdBackMs) },
	});
	console.log(`  held back ${others.length} exhausted task(s) owned by nobody`);

	return others;
}

async function releaseHeldBack(held: readonly HeldTask[]) {
	for (const task of held) {
		await db.agentTask.updateMany({
			where: { id: task.id },
			data: { leasedUntil: task.leasedUntil },
		});
	}
}

async function main() {
	const stamp = Date.now();
	const company = await db.company.create({
		data: {
			name: `${E2E.retry.companyPrefix} ${stamp}`,
			domain: `retry-${stamp}.test`,
		},
		select: { id: true },
	});
	let held: HeldTask[] = [];

	try {
		const task = await db.agentTask.create({
			data: {
				companyId: company.id,
				kind: E2E.retry.kind,
				reason: E2E.retry.reason,
				priority: E2E.retry.priority,
				budget: 1,
				dueAt: new Date(),
			},
			select: { id: true },
		});

		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
			const claimed = await claimMine();
			const mine = claimed.find((row) => row.id === task.id);
			record(
				`attempt ${attempt} is claimable`,
				mine?.attempts === attempt,
				mine ? `attempts=${mine.attempts}` : "not claimed",
			);
			await expireLease(task.id);
		}

		const afterLimit = await claimMine();
		record(
			`no claim past ${MAX_ATTEMPTS} attempts`,
			afterLimit.length === 0,
			`${afterLimit.length} task(s) claimed`,
		);

		held = await holdBackOtherExhausted(task.id);
		await retireAbandoned();

		const retired = await db.agentTask.findUnique({
			where: { id: task.id },
			select: { finishedAt: true, outcome: true },
		});
		record(
			"exhausted task is retired, not left queued",
			Boolean(retired?.finishedAt) && retired?.outcome === RETIRED_OUTCOME,
			retired?.outcome ?? "still queued",
		);

		const enrichment = await db.company.findUnique({
			where: { id: company.id },
			select: { enrichmentStatus: true, enrichmentError: true },
		});
		record(
			"the record says why it gave up",
			enrichment?.enrichmentStatus === "FAILED",
			enrichment?.enrichmentError ?? "no reason recorded",
		);
	} finally {
		try {
			await releaseHeldBack(held);
			await db.agentTask.deleteMany({ where: { companyId: company.id } });
			await db.company.delete({ where: { id: company.id } });
		} catch (error) {
			record("cleanup leaves nothing behind", false, reasonOf(error));
		}
	}

	const failed = results.filter((row) => !row.ok).length;
	console.log(
		failed === 0
			? `\nAll ${results.length} retry checks passed.`
			: `\n${failed} of ${results.length} retry checks failed.`,
	);
	process.exit(failed === 0 ? 0 : 1);
}

await main();
