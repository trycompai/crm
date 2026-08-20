import { db, EnrichmentStatus, type Prisma } from "@crm/db";
import { isEnrichmentKind, MAX_ATTEMPTS } from "@crm/db/agent-tasks";
import { DISPATCH } from "./dispatch-config";
import { settle } from "./enrichment";
import { retireExhausted, type TaskSubject } from "./tasks";

const SCAN = DISPATCH.reconcile.scan;

const LANDED_OUTCOME =
	"The record was already up to date when this was checked again.";

const RETIRED_ERROR =
	"Research was attempted several times and never completed.";

const UNTARGETED_OUTCOME =
	"No record was ever attached to this task, so it can never be worked. Retired.";

export type StaleTaskSweep = {
	scanned: number;
	closed: number;
	retired: number;
	released: number;
	waiting: number;
	unscanned: number;
	error: string | null;
};

type OpenTask = {
	id: string;
	kind: string;
	contactId: string | null;
	companyId: string | null;
	dealId: string | null;
	attempts: number;
	leasedUntil: Date | null;
	startedAt: Date | null;
};

let lastSweep: StaleTaskSweep | null = null;

export function staleTaskSweep(): StaleTaskSweep | null {
	return lastSweep;
}

export async function retireAbandoned(): Promise<TaskSubject[]> {
	let abandoned: TaskSubject[] = [];

	try {
		abandoned = await retireExhausted();
	} catch {
		return [];
	}

	for (const task of abandoned) {
		await settle(task, EnrichmentStatus.FAILED, RETIRED_ERROR).catch(() => {});
	}

	return abandoned;
}

export async function reconcileStaleTasks(): Promise<StaleTaskSweep> {
	const sweep: StaleTaskSweep = {
		scanned: 0,
		closed: 0,
		retired: 0,
		released: 0,
		waiting: 0,
		unscanned: 0,
		error: null,
	};

	try {
		await runSweep(sweep);
	} catch (cause) {
		sweep.error = cause instanceof Error ? cause.message : String(cause);
		console.error(`[agent] Stale task reconciliation failed: ${sweep.error}`);
	}

	lastSweep = sweep;
	return sweep;
}

async function runSweep(sweep: StaleTaskSweep): Promise<void> {
	const now = new Date();

	const where: Prisma.AgentTaskWhereInput = {
		finishedAt: null,
		dueAt: { lte: now },
		OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }],
	};

	const [open, tasks] = await Promise.all([
		db.agentTask.count({ where }),
		db.agentTask.findMany({
			where,
			orderBy: [{ dueAt: "asc" }],
			take: SCAN,
			select: {
				id: true,
				kind: true,
				contactId: true,
				companyId: true,
				dealId: true,
				attempts: true,
				leasedUntil: true,
				startedAt: true,
			},
		}),
	]);

	sweep.scanned = tasks.length;
	sweep.unscanned = Math.max(0, open - tasks.length);

	const completed = await completedSubjects(tasks);

	const landed: string[] = [];
	const untargeted: string[] = [];
	const dead: string[] = [];

	for (const task of tasks) {
		if (isUntargetedFieldBackfill(task)) {
			untargeted.push(task.id);
			continue;
		}

		if (finishedElsewhere(task, completed)) {
			landed.push(task.id);
			continue;
		}

		if (task.attempts >= MAX_ATTEMPTS) continue;

		if (task.leasedUntil !== null) dead.push(task.id);
		else sweep.waiting += 1;
	}

	if (landed.length > 0) {
		const { count } = await db.agentTask.updateMany({
			where: {
				id: { in: landed },
				finishedAt: null,
				OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }],
			},
			data: { finishedAt: now, outcome: LANDED_OUTCOME },
		});

		sweep.closed = count;
	}

	if (untargeted.length > 0) {
		const { count } = await db.agentTask.updateMany({
			where: {
				id: { in: untargeted },
				finishedAt: null,
				OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }],
			},
			data: { finishedAt: now, outcome: UNTARGETED_OUTCOME },
		});

		sweep.closed += count;
	}

	sweep.retired = (await retireAbandoned()).length;

	if (dead.length > 0) {
		const { count } = await db.agentTask.updateMany({
			where: { id: { in: dead }, finishedAt: null, leasedUntil: { lt: now } },
			data: { leasedUntil: null },
		});

		sweep.released = count;
	}
}

async function completedSubjects(
	tasks: readonly OpenTask[],
): Promise<Map<string, Date>> {
	const contactIds = unique(tasks.map((task) => task.contactId));
	const companyIds = unique(tasks.map((task) => task.companyId));

	const [contacts, companies] = await Promise.all([
		contactIds.length === 0
			? []
			: db.contact.findMany({
					where: {
						id: { in: contactIds },
						enrichmentStatus: EnrichmentStatus.COMPLETE,
						enrichedAt: { not: null },
					},
					select: { id: true, enrichedAt: true },
				}),
		companyIds.length === 0
			? []
			: db.company.findMany({
					where: {
						id: { in: companyIds },
						enrichmentStatus: EnrichmentStatus.COMPLETE,
						enrichedAt: { not: null },
					},
					select: { id: true, enrichedAt: true },
				}),
	]);

	const completed = new Map<string, Date>();

	for (const row of [...contacts, ...companies]) {
		if (row.enrichedAt) completed.set(row.id, row.enrichedAt);
	}

	return completed;
}

function finishedElsewhere(
	task: OpenTask,
	completed: Map<string, Date>,
): boolean {
	if (!isEnrichmentKind(task.kind)) return false;
	if (task.attempts === 0 || task.startedAt === null) return false;

	const subjectId = task.contactId ?? task.companyId;
	if (!subjectId) return false;

	const enrichedAt = completed.get(subjectId);
	if (!enrichedAt) return false;

	return enrichedAt.getTime() >= task.startedAt.getTime();
}

function isUntargetedFieldBackfill(task: OpenTask): boolean {
	return (
		task.kind === "field-backfill" &&
		!task.contactId &&
		!task.companyId &&
		!task.dealId
	);
}

function unique(ids: readonly (string | null)[]): string[] {
	return [...new Set(ids.filter((id): id is string => id !== null))];
}
