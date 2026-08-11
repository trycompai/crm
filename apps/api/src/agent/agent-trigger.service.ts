import { type Db, type FieldEntity, Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { bridge } from "./bridge";

const POKE_TIMEOUT_MS = 2_000;

const INBOUND_SYNC_TASKS = [
	{
		kind: "website-intake-sync",
		reason: "Website intake check requested from Connections",
	},
	{
		kind: "agentmail-sync",
		reason: "AgentMail check requested from Connections",
	},
	{
		kind: "granola-sync",
		reason: "Granola check requested from Connections",
	},
] as const;

export type InboundSyncTaskKind = (typeof INBOUND_SYNC_TASKS)[number]["kind"];

@Injectable()
export class AgentTriggerService {
	private readonly logger = new Logger(AgentTriggerService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async companyCreated(
		companyId: string,
		reason = "New company",
	): Promise<void> {
		await this.enqueue({
			companyId,
			kind: "brand",
			reason,
			priority: PRIORITY.brand,
			budget: 2,
		});

		await this.enqueue({
			companyId,
			kind: "company-profile",
			reason,
			priority: PRIORITY.companyProfile,
			budget: 4,
		});
	}

	async companyRequested(companyId: string, reason: string): Promise<void> {
		await this.enqueue({
			companyId,
			kind: "brand",
			reason,
			priority: PRIORITY.brand,
			budget: 2,
		});

		await this.enqueue({
			companyId,
			kind: "company-profile",
			reason,
			priority: PRIORITY.requested,
			budget: 8,
		});
	}

	async workspaceChanged(website: string, reason: string): Promise<void> {
		await this.enqueue({
			kind: "workspace-profile",
			reason: `${reason} (${website})`,
			priority: PRIORITY.workspace,
			budget: 4,
		});
	}

	async contactCreated(contactId: string, reason: string): Promise<void> {
		await this.enqueue({
			contactId,
			kind: "identify",
			reason,
			priority: PRIORITY.identify,
			budget: 4,
		});
	}

	async fieldBackfill(
		entity: FieldEntity,
		key: string,
		reason: string,
	): Promise<void> {
		const subject = `${entity.toLowerCase()}.${key}`;

		try {
			const pending = await this.db.agentTask.findFirst({
				where: {
					kind: "field-backfill",
					finishedAt: null,
					reason: { startsWith: `${subject}: ` },
				},
				select: { id: true },
			});

			if (pending) return;

			await this.db.agentTask.create({
				data: {
					kind: "field-backfill",
					reason: `${subject}: ${reason}`,
					priority: PRIORITY.fieldBackfill,
					budget: 8,
					dueAt: new Date(),
				},
			});

			this.logger.log({
				message: "Agent task queued",
				kind: "field-backfill",
				entity,
				key,
			});

			this.poke();
		} catch (error) {
			this.logger.error(
				{
					message: "Could not queue agent task",
					kind: "field-backfill",
					entity,
					key,
				},
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	async syncInbound(
		kinds: readonly InboundSyncTaskKind[] = INBOUND_SYNC_TASKS.map(
			(task) => task.kind,
		),
	): Promise<{ queued: number; configured: number }> {
		const allowed = new Set(kinds);
		const tasks = INBOUND_SYNC_TASKS.filter((task) => allowed.has(task.kind));

		const results = await Promise.all(
			tasks.map((task) => this.enqueueGlobal(task.kind, task.reason)),
		);
		if (tasks.length > 0 && !results.some(Boolean)) this.poke();
		return {
			queued: results.filter(Boolean).length,
			configured: tasks.length,
		};
	}

	async meetingSoon(contactId: string, when: Date): Promise<void> {
		await this.enqueue({
			contactId,
			kind: "meeting-prep",
			reason: `Meeting on ${when.toDateString()} with someone we know nothing about`,
			priority: PRIORITY.meeting,
			budget: 10,
		});
	}

	builderConversationQueued(): void {
		this.pokeRoute("/internal/crm/builder-dispatch");
	}

	deployedAgentRunQueued(): void {
		this.pokeRoute("/internal/crm/agent-dispatch");
	}

	async backfill(input: {
		kind: string;
		reason: string;
		contactIds?: string[];
		companyIds?: string[];
		prospectIds?: string[];
		budget?: number;
		priority?: number;
	}): Promise<{ queued: number; alreadyQueued: number }> {
		const subject = input.contactIds
			? "contactId"
			: input.companyIds
				? "companyId"
				: "prospectId";
		const ids = [
			...new Set(
				input.contactIds ?? input.companyIds ?? input.prospectIds ?? [],
			),
		];
		if (ids.length === 0) return { queued: 0, alreadyQueued: 0 };

		try {
			const outstanding = await this.db.agentTask.findMany({
				where: {
					kind: input.kind,
					finishedAt: null,
					[subject]: { in: ids },
				},
				select: { [subject]: true },
			});

			const taken = new Set(
				outstanding.map((row) => (row as Record<string, unknown>)[subject]),
			);
			const fresh = ids.filter((id) => !taken.has(id));

			if (fresh.length > 0) {
				await this.db.agentTask.createMany({
					data: fresh.map((id) => ({
						contactId: input.contactIds ? id : null,
						companyId: input.companyIds ? id : null,
						prospectId: input.prospectIds ? id : null,
						kind: input.kind,
						reason: input.reason,
						priority: input.priority ?? PRIORITY.sweep,
						budget: input.budget ?? 4,
						dueAt: new Date(),
					})),
				});
			}

			this.logger.log({
				message: "Backfill queued",
				kind: input.kind,
				queued: fresh.length,
				alreadyQueued: ids.length - fresh.length,
			});

			if (fresh.length > 0) this.poke();

			return {
				queued: fresh.length,
				alreadyQueued: ids.length - fresh.length,
			};
		} catch (error) {
			this.logger.error(
				{ message: "Could not queue backfill", kind: input.kind },
				error instanceof Error ? error.stack : String(error),
			);
			throw error;
		}
	}

	async discoverProspects(count: number, countryCodes: string[]) {
		const reason = `Find ${count} evidence-backed Lode prospects in ${countryCodes.join(",")}`;
		const queued = await this.enqueueGlobal(
			"lead-discovery",
			reason,
			PRIORITY.leadDiscovery,
			Math.max(10, Math.min(100, count)),
		);
		return { queued: queued ? 1 : 0, alreadyQueued: queued ? 0 : 1 };
	}

	async composeOutreach(prospectId: string): Promise<void> {
		await this.enqueue({
			prospectId,
			kind: "outreach-compose",
			reason: "Prepare an approved-only A/B/C outreach sequence",
			priority: PRIORITY.outreachCompose,
			budget: 8,
		});
	}

	async sendEmailDraft(emailDraftId: string, dueAt: Date): Promise<void> {
		await this.enqueue({
			emailDraftId,
			kind: "email-draft-send",
			reason:
				"Send an approved outreach sequence step with idempotency and stop rules",
			priority: PRIORITY.outreachSend,
			budget: 0,
			dueAt,
		});
	}

	async planCustomerOnboarding(
		dealId: string,
		companyId: string,
	): Promise<void> {
		await this.enqueue({
			dealId,
			companyId,
			kind: "customer-onboarding-plan",
			reason:
				"Build the won customer's systems, data, access and Lode Brain onboarding plan",
			priority: PRIORITY.onboarding,
			budget: 12,
		});
	}

	workQueued(): void {
		this.poke();
	}

	private async enqueue(task: {
		contactId?: string;
		companyId?: string;
		prospectId?: string;
		dealId?: string;
		emailDraftId?: string;
		kind: string;
		reason: string;
		priority: number;
		budget: number;
		dueAt?: Date;
	}): Promise<void> {
		try {
			const queued = await this.db.$transaction(async (tx) => {
				await lockAgentTask(tx, enqueueLockKey(task));

				const pending = await tx.agentTask.findFirst({
					where: {
						kind: task.kind,
						finishedAt: null,
						...(task.contactId ? { contactId: task.contactId } : {}),
						...(task.companyId ? { companyId: task.companyId } : {}),
						...(task.prospectId ? { prospectId: task.prospectId } : {}),
						...(task.dealId ? { dealId: task.dealId } : {}),
						...(task.emailDraftId ? { emailDraftId: task.emailDraftId } : {}),
					},
					select: { id: true },
				});

				if (pending) return false;

				await tx.agentTask.create({
					data: {
						contactId: task.contactId ?? null,
						companyId: task.companyId ?? null,
						prospectId: task.prospectId ?? null,
						dealId: task.dealId ?? null,
						emailDraftId: task.emailDraftId ?? null,
						kind: task.kind,
						reason: task.reason,
						priority: task.priority,
						budget: task.budget,
						dueAt: task.dueAt ?? new Date(),
					},
				});

				return true;
			});

			if (!queued) return;

			this.logger.log({
				message: "Agent task queued",
				kind: task.kind,
				contactId: task.contactId,
				companyId: task.companyId,
				prospectId: task.prospectId,
				dealId: task.dealId,
				emailDraftId: task.emailDraftId,
			});

			this.poke();
		} catch (error) {
			this.logger.error(
				{ message: "Could not queue agent task", kind: task.kind },
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	private async enqueueGlobal(
		kind: string,
		reason: string,
		priority: number = PRIORITY.inbound,
		budget = 0,
	): Promise<boolean> {
		const queued = await this.db.$transaction(async (tx) => {
			await lockAgentTask(tx, `agent-task:${kind}:global`);

			const pending = await tx.agentTask.findFirst({
				where: { kind, finishedAt: null },
				select: { id: true },
			});
			if (pending) return false;

			await tx.agentTask.create({
				data: {
					kind,
					reason,
					priority,
					budget,
					dueAt: new Date(),
				},
			});

			return true;
		});

		if (!queued) return false;

		this.logger.log({ message: "Inbound task queued", kind });
		this.poke();
		return true;
	}

	private poke(): void {
		this.pokeRoute("/internal/crm/dispatch");
	}

	private pokeRoute(path: string): void {
		const agent = bridge();
		if (!agent) return;

		const missed = (error: unknown) => {
			this.logger.debug({
				message: "Agent poke did not land; the cron will pick this up",
				reason: error instanceof Error ? error.message : String(error),
			});
		};

		try {
			void fetch(agent.url(path), {
				method: "POST",
				headers: { authorization: `Bearer ${agent.secret}` },
				signal: AbortSignal.timeout(POKE_TIMEOUT_MS),
			})
				.then((response) => {
					if (!response.ok) {
						throw new Error(`Agent poke returned ${response.status}.`);
					}
				})
				.catch(missed);
		} catch (error) {
			missed(error);
		}
	}
}

type AgentTaskLockClient = Pick<Db, "$executeRaw">;

async function lockAgentTask(
	db: AgentTaskLockClient,
	key: string,
): Promise<void> {
	await db.$executeRaw(
		Prisma.sql`SELECT pg_advisory_xact_lock(47001, hashtext(${key}))`,
	);
}

function enqueueLockKey(task: {
	contactId?: string;
	companyId?: string;
	prospectId?: string;
	dealId?: string;
	emailDraftId?: string;
	kind: string;
}): string {
	const subject = [
		task.contactId ? `contact:${task.contactId}` : null,
		task.companyId ? `company:${task.companyId}` : null,
		task.prospectId ? `prospect:${task.prospectId}` : null,
		task.dealId ? `deal:${task.dealId}` : null,
		task.emailDraftId ? `email-draft:${task.emailDraftId}` : null,
	]
		.filter((part): part is string => part !== null)
		.join("|");

	return `agent-task:${task.kind}:${subject || "global"}`;
}
