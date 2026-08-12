import { type Db, type FieldEntity, Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { CRM_EVENT_CATALOG, type CrmEventType } from "@crm/db/crm-events";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { AGENT_DISPATCH } from "./agent-dispatch.config";
import { bridge } from "./bridge";

export type CrmEventInput = {
	[Type in CrmEventType]: {
		type: Type;
		record: {
			kind: (typeof CRM_EVENT_CATALOG)[Type]["recordKind"];
			id: string;
		};
		occurredAt: Date;
		data: Prisma.InputJsonObject;
	};
}[CrmEventType];

export type AgentTaskQueue = {
	slackChannelJoinRequested: (
		channelId: string,
		channelName: string,
	) => Promise<void>;
};

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
	private readonly cancellationsDelivered = new Set<string>();

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

	async trackingSubmissionReceived(
		submissionId: string,
		host: string,
	): Promise<void> {
		await this.enqueue(
			{
				kind: "inbound-candidate-replay",
				reason: `Review tracking submission ${submissionId} from ${host}`,
				priority: PRIORITY.inbound,
				budget: 0,
			},
			true,
		);
	}

	async slackPeopleRequested(reason: string, required = false): Promise<void> {
		await this.enqueue(
			{
				kind: "slack-people-match",
				reason,
				priority: PRIORITY.slackPeople,
				budget: 1,
			},
			required,
		);
	}

	async slackChannelJoinRequested(
		channelId: string,
		channelName: string,
	): Promise<void> {
		await this.queueSlackChannelJoin(channelId, channelName);
	}

	async withTasks<Result>(
		work: (
			tx: Prisma.TransactionClient,
			queue: AgentTaskQueue,
		) => Promise<Result>,
	): Promise<Result> {
		let queued = false;

		const result = await this.db.$transaction((tx) =>
			work(tx, {
				slackChannelJoinRequested: async (channelId, channelName) => {
					const created = await this.queueSlackChannelJoin(
						channelId,
						channelName,
						tx,
					);
					queued = queued || created;
				},
			}),
		);

		if (queued) this.poke();

		return result;
	}

	private queueSlackChannelJoin(
		channelId: string,
		channelName: string,
		client?: Prisma.TransactionClient,
	): Promise<boolean> {
		return this.enqueue(
			{
				kind: "slack-channel-join",
				reason: `Add Comp AI to #${channelName}`,
				priority: PRIORITY.slackJoin,
				budget: 1,
				subject: { path: ["channelId"], value: channelId },
				payload: {
					type: "slack.channel.join",
					channelId,
					channelName,
				},
			},
			true,
			client,
		);
	}

	async withCrmEvents<Result>(
		work: (
			tx: Prisma.TransactionClient,
			emit: (input: CrmEventInput) => Promise<void>,
		) => Promise<Result>,
	): Promise<Result> {
		const queued: CrmEventInput[] = [];
		const result = await this.db.$transaction((tx) =>
			work(tx, async (input) => {
				await this.createEventTask(tx, input);
				queued.push(input);
			}),
		);

		for (const input of queued) {
			this.logger.log({
				message: "Agent event queued",
				type: input.type,
				recordKind: input.record.kind,
				recordId: input.record.id,
			});
		}
		if (queued.length > 0) this.poke();

		return result;
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

	deployedAgentRunCancelled(runId: string): void {
		void this.deliverCancellation(runId);
	}

	async redeliverCancellations(): Promise<void> {
		try {
			const since = new Date(
				Date.now() - AGENT_DISPATCH.cancel.redeliverWithinMs,
			);
			const runs = await this.db.agentRun.findMany({
				where: {
					status: "CANCELLED",
					errorCode: AGENT_DISPATCH.cancel.errorCode,
					startedAt: { not: null },
					finishedAt: { gte: since },
				},
				orderBy: { finishedAt: "desc" },
				take: AGENT_DISPATCH.cancel.redeliverBatch,
				select: { id: true },
			});

			const outstanding = new Set(runs.map((run) => run.id));
			for (const runId of this.cancellationsDelivered) {
				if (!outstanding.has(runId)) this.cancellationsDelivered.delete(runId);
			}

			for (const run of runs) {
				if (this.cancellationsDelivered.has(run.id)) continue;
				await this.deliverCancellation(run.id);
			}
		} catch (error) {
			this.logger.error(
				{ message: "Could not redeliver run cancellations" },
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	private async deliverCancellation(runId: string): Promise<void> {
		const delivered = await this.post("/internal/crm/cancel-run", { runId });
		if (delivered) this.cancellationsDelivered.add(runId);
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

	private async enqueue(
		task: {
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
			payload?: Prisma.InputJsonValue;
			subject?: { path: string[]; value: string };
		},
		required = false,
		client?: Prisma.TransactionClient,
	): Promise<boolean> {
		try {
			const write = async (tx: Prisma.TransactionClient) => {
				await lockIdempotencyKey(tx, enqueueLockKey(task));
				const pending = await tx.agentTask.findFirst({
					where: {
						kind: task.kind,
						finishedAt: null,
						...(task.contactId ? { contactId: task.contactId } : {}),
						...(task.companyId ? { companyId: task.companyId } : {}),
						...(task.prospectId ? { prospectId: task.prospectId } : {}),
						...(task.dealId ? { dealId: task.dealId } : {}),
						...(task.emailDraftId ? { emailDraftId: task.emailDraftId } : {}),
						...(task.subject
							? {
									payload: {
										path: task.subject.path,
										equals: task.subject.value,
									},
								}
							: {}),
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
						subject: task.subject?.value ?? null,
						...(task.payload !== undefined ? { payload: task.payload } : {}),
					},
				});
				return true;
			};

			const created = client
				? await write(client)
				: await this.db.$transaction(write);
			if (!created) return false;

			this.logger.log({
				message: "Agent task queued",
				kind: task.kind,
				contactId: task.contactId,
				companyId: task.companyId,
				prospectId: task.prospectId,
				dealId: task.dealId,
				emailDraftId: task.emailDraftId,
			});

			if (!client) this.poke();

			return true;
		} catch (error) {
			this.logger.error(
				{ message: "Could not queue agent task", kind: task.kind },
				error instanceof Error ? error.stack : String(error),
			);
			if (required) throw error;
			return false;
		}
	}

	private async enqueueGlobal(
		kind: string,
		reason: string,
		priority: number = PRIORITY.inbound,
		budget = 0,
	): Promise<boolean> {
		return this.enqueue({ kind, reason, priority, budget });
	}

	private async createEventTask(
		tx: Prisma.TransactionClient,
		input: CrmEventInput,
	): Promise<void> {
		const recordIds = {
			contactId: input.record.kind === "contact" ? input.record.id : null,
			companyId: input.record.kind === "company" ? input.record.id : null,
			dealId: input.record.kind === "deal" ? input.record.id : null,
		};
		await tx.agentTask.create({
			data: {
				...recordIds,
				kind: "agent-event",
				reason: input.type,
				payload: {
					type: input.type,
					record: input.record,
					occurredAt: input.occurredAt.toISOString(),
					data: input.data,
				},
				priority: PRIORITY.event,
				budget: 1,
				dueAt: new Date(),
			},
		});
	}

	canReachAgent(): boolean {
		return bridge() !== null;
	}

	drainQueues(): void {
		this.poke();
		this.deployedAgentRunQueued();
		this.builderConversationQueued();
		void this.redeliverCancellations();
	}

	private poke(): void {
		this.pokeRoute("/internal/crm/dispatch");
	}

	private pokeRoute(path: string): void {
		void this.post(path);
	}

	private async post(
		path: string,
		body?: Record<string, string>,
	): Promise<boolean> {
		const agent = bridge();
		if (!agent) return false;

		try {
			const response = await fetch(agent.url(path), {
				method: "POST",
				headers: {
					authorization: `Bearer ${agent.secret}`,
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
				signal: AbortSignal.timeout(AGENT_DISPATCH.poke.timeoutMs),
			});

			if (!response.ok) {
				throw new Error(`Agent poke returned ${response.status}.`);
			}

			return true;
		} catch (error) {
			this.logger.debug({
				message: "Agent poke did not land; the cron will pick this up",
				reason: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}
}

function enqueueLockKey(task: {
	contactId?: string;
	companyId?: string;
	prospectId?: string;
	dealId?: string;
	emailDraftId?: string;
	subject?: { value: string };
	kind: string;
}): string {
	const subject = [
		task.contactId ? `contact:${task.contactId}` : null,
		task.companyId ? `company:${task.companyId}` : null,
		task.prospectId ? `prospect:${task.prospectId}` : null,
		task.dealId ? `deal:${task.dealId}` : null,
		task.emailDraftId ? `email-draft:${task.emailDraftId}` : null,
		task.subject ? `payload:${task.subject.value}` : null,
	]
		.filter((part): part is string => part !== null)
		.join("|");

	return `agent-task:${task.kind}:${subject || "global"}`;
}
