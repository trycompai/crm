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
		budget?: number;
		priority?: number;
	}): Promise<{ queued: number; alreadyQueued: number }> {
		const subject = input.contactIds ? "contactId" : "companyId";
		const ids = [...new Set(input.contactIds ?? input.companyIds ?? [])];
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

	async marketingConnected(): Promise<void> {
		await this.enqueue({
			kind: "marketing-brand",
			reason: "Marketing was connected",
			priority: 5,
			budget: 1,
		});
	}

	private async enqueue(
		task: {
			contactId?: string;
			companyId?: string;
			kind: string;
			reason: string;
			priority: number;
			budget: number;
			payload?: Prisma.InputJsonValue;
			subject?: { path: string[]; value: string };
		},
		required = false,
		client?: Prisma.TransactionClient,
	): Promise<boolean> {
		try {
			const write = async (tx: Prisma.TransactionClient) => {
				await lockIdempotencyKey(
					tx,
					`agent-task:${task.kind}:${task.contactId ?? ""}:${task.companyId ?? ""}:${task.subject?.value ?? ""}`,
				);
				const pending = await tx.agentTask.findFirst({
					where: {
						kind: task.kind,
						finishedAt: null,
						contactId: task.contactId ?? undefined,
						companyId: task.companyId ?? undefined,
						payload: task.subject
							? { path: task.subject.path, equals: task.subject.value }
							: undefined,
					},
					select: { id: true },
				});
				if (pending) return false;

				await tx.agentTask.create({
					data: {
						contactId: task.contactId ?? null,
						companyId: task.companyId ?? null,
						kind: task.kind,
						reason: task.reason,
						priority: task.priority,
						budget: task.budget,
						dueAt: new Date(),
						payload: task.payload ?? undefined,
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
			const headers = new Headers({
				authorization: `Bearer ${agent.secret}`,
			});
			if (body) headers.set("content-type", "application/json");

			const response = await fetch(agent.url(path), {
				method: "POST",
				headers,
				body: body ? JSON.stringify(body) : undefined,
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
