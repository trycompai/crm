import { db } from "@crm/db";
import { MAX_ATTEMPTS, RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { retireAbandoned } from "../../agent/lib/dispatch";
import { claimDue, DIRECT_KINDS } from "../../agent/lib/tasks";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function expireLease(taskId: string) {
	await db.agentTask.update({
		where: { id: taskId },
		data: { leasedUntil: new Date(Date.now() - 60_000) },
	});
}

async function main() {
	const company = await db.company.create({
		data: {
			name: `Retry Co ${Date.now()}`,
			domain: `retry-${Date.now()}.test`,
		},
		select: { id: true },
	});
	const task = await db.agentTask.create({
		data: {
			companyId: company.id,
			kind: "company-profile",
			reason: "e2e.retry",
			priority: 900,
			budget: 1,
			dueAt: new Date(),
		},
		select: { id: true },
	});

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		const claimed = await claimDue(10, { except: DIRECT_KINDS }, 5 * 60_000);
		const mine = claimed.find((row) => row.id === task.id);
		record(
			`attempt ${attempt} is claimable`,
			mine?.attempts === attempt,
			mine ? `attempts=${mine.attempts}` : "not claimed",
		);
		await expireLease(task.id);
	}

	const afterLimit = await claimDue(10, { except: DIRECT_KINDS }, 5 * 60_000);
	record(
		`no claim past ${MAX_ATTEMPTS} attempts`,
		!afterLimit.some((row) => row.id === task.id),
		`${afterLimit.length} other task(s) claimed`,
	);

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

	await db.agentTask.deleteMany({ where: { companyId: company.id } });
	await db.company.delete({ where: { id: company.id } });

	const failed = results.filter((row) => !row.ok).length;
	console.log(
		failed === 0
			? `\nAll ${results.length} retry checks passed.`
			: `\n${failed} of ${results.length} retry checks failed.`,
	);
	process.exit(failed === 0 ? 0 : 1);
}

await main();
