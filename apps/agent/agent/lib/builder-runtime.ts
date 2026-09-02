import { isDeepStrictEqual } from "node:util";
import { db, type Prisma } from "@crm/db";
import {
	CRM_EVENT_CATALOG,
	CRM_EVENT_TYPES,
	type CrmEventType,
} from "@crm/db/crm-events";
import { readAgentModel } from "@crm/db/settings";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { AGENT_ACTION_TYPES } from "@crm/validation/agent-manifest";
import { z } from "zod";
import { actionDependency } from "./agent-actions";
import { requestStaleSlackInventorySync } from "./slack-people";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export type BuilderResource = {
	kind: "integration" | "company" | "contact" | "deal";
	id: string;
	label: string;
};

const taggedResource = z
	.object({
		kind: z.enum(["integration", "company", "contact", "deal"]),
		id: z.string(),
		label: z.string(),
	})
	.nullable()
	.catch(null);

const taggedResources = z
	.object({ resources: z.array(taggedResource).catch([]) })
	.catch({ resources: [] });

export type DraftTrigger = {
	type: "MANUAL" | "SCHEDULE" | "EVENT";
	name: string;
	summary: string;
	event?: CrmEventType | null;
	nextRunAt?: string | null;
	intervalMinutes?: number | null;
};

export type DraftAction =
	| {
			type: typeof AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE;
			provider: "crm";
			summary: string;
			activityTypes: ("NOTE" | "TASK")[];
	  }
	| {
			type: typeof AGENT_ACTION_TYPES.RUN_SUMMARY;
			provider: "crm";
			summary: string;
	  }
	| {
			type: typeof AGENT_ACTION_TYPES.SLACK_MESSAGE_POST;
			provider: "slack";
			summary: string;
			destination: {
				kind: "channel" | "user";
				resolution: "chosen";
				id: string;
				label: string;
			};
	  };

export type DraftAgentInput = {
	name: string;
	description: string;
	instructions: string;
	triggers: DraftTrigger[];
	recordScope: "SELECTED" | "WORKSPACE";
	resources: BuilderResource[];
	actions: DraftAction[];
	access: string[];
};

export const BUILDER_ARTIFACT_PATHS = [
	"agent/README.md",
	"agent/instructions.md",
	"agent/manifest.json",
] as const;

export type BuilderArtifactPath = (typeof BUILDER_ARTIFACT_PATHS)[number];

const ARTIFACT_LANGUAGES = {
	"agent/README.md": "markdown",
	"agent/instructions.md": "markdown",
	"agent/manifest.json": "json",
} satisfies Record<BuilderArtifactPath, string>;

export async function writeBuilderArtifact(
	conversationId: string,
	userId: string,
	path: BuilderArtifactPath,
	content: string,
) {
	assertSafeArtifact(content);

	return db.$transaction(async (tx) => {
		const [conversation] = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id
			FROM "agentConversation"
			WHERE id = ${conversationId}
				AND "userId" = ${userId}
				AND kind = 'BUILDER'
			FOR UPDATE
		`;
		if (!conversation) {
			throw new Error("This builder conversation is unavailable.");
		}

		const latest = await tx.agentBuilderArtifact.findFirst({
			where: { conversationId, path },
			orderBy: { revision: "desc" },
			select: { id: true, revision: true, content: true, status: true },
		});

		if (latest?.content === content) {
			return { saved: true as const, id: latest.id, revision: latest.revision };
		}

		const artifact = await tx.agentBuilderArtifact.create({
			data: {
				conversationId,
				path,
				language: ARTIFACT_LANGUAGES[path],
				content,
				previousContent: latest?.content ?? null,
				revision: (latest?.revision ?? 0) + 1,
				status: "WRITING",
			},
			select: { id: true, revision: true },
		});

		return { saved: true as const, ...artifact };
	});
}

export async function builderContext(conversationId: string, userId: string) {
	const conversation = await db.agentConversation.findFirst({
		where: { id: conversationId, userId, kind: "BUILDER" },
		select: {
			id: true,
			title: true,
			agent: {
				select: {
					id: true,
					name: true,
					description: true,
					status: true,
					versions: {
						orderBy: { number: "desc" },
						take: 1,
						select: {
							id: true,
							number: true,
							status: true,
							manifest: true,
							instructions: true,
						},
					},
				},
			},
			submissions: {
				orderBy: { createdAt: "asc" },
				select: { id: true, message: true, createdAt: true },
			},
		},
	});

	if (!conversation)
		throw new Error("This builder conversation is unavailable.");

	const resources = uniqueResources(
		conversation.submissions.flatMap((submission) =>
			resourcesOf(submission.message),
		),
	);

	return {
		conversation: {
			id: conversation.id,
			title: conversation.title,
		},
		availableConnections: await connectionStatus(userId),
		crmEvents: CRM_EVENT_TYPES.map((type) => ({
			type,
			...CRM_EVENT_CATALOG[type],
		})),
		resources: await describeResources(resources),
		existingDraft: conversation.agent,
		now: new Date().toISOString(),
	};
}

export async function saveBuilderDraft(
	conversationId: string,
	userId: string,
	input: DraftAgentInput,
) {
	const conversation = await db.agentConversation.findFirst({
		where: { id: conversationId, userId, kind: "BUILDER" },
		select: {
			id: true,
			submissions: { select: { message: true } },
		},
	});

	if (!conversation)
		throw new Error("This builder conversation is unavailable.");

	const taggedResources = uniqueResources(
		conversation.submissions.flatMap((submission) =>
			resourcesOf(submission.message),
		),
	);
	const validation = await validateDraft(userId, input, taggedResources);
	if (!validation.valid) {
		return {
			saved: false as const,
			issues: validation.issues,
			availableConnections: validation.connections,
		};
	}

	const model = await readAgentModel(db);
	const now = new Date();
	const manifestTriggers = input.triggers.map((trigger) => ({
		type: trigger.type,
		name: trigger.name,
		summary: trigger.summary,
		config:
			trigger.type === "SCHEDULE"
				? {
						intervalMinutes: trigger.intervalMinutes,
						nextRunAt: scheduleDate(trigger, now)?.toISOString(),
					}
				: trigger.type === "EVENT"
					? { event: trigger.event }
					: {},
	}));
	const manifest = {
		kind: "crm-team-agent",
		name: input.name,
		description: input.description,
		triggers: manifestTriggers,
		dataScope: {
			mode: input.recordScope,
			summary: scopeSummary(input.recordScope, input.resources),
			resources: input.resources,
		},
		actions: input.actions,
		access: input.access,
	};
	const sandboxPolicy = {
		backend: "eve-default",
		networkPolicy: "deny-all",
		credentials: "app-runtime-only",
		summary: "Isolated sandbox · deny-all network · bounded CRM tools",
	};
	const files = artifactFiles(input, JSON.stringify(manifest, null, 2));
	for (const file of files) assertSafeArtifact(file.content);

	return db.$transaction(async (tx) => {
		const [lockedConversation] = await tx.$queryRaw<
			Array<{ id: string; agentId: string | null }>
		>`
			SELECT id, "agentId"
			FROM "agentConversation"
			WHERE id = ${conversationId}
				AND "userId" = ${userId}
				AND kind = 'BUILDER'
			FOR UPDATE
		`;
		if (!lockedConversation) {
			throw new Error("This builder conversation is unavailable.");
		}

		let agentId = lockedConversation.agentId;
		let created = false;

		if (!agentId) {
			const agent = await tx.agentDefinition.create({
				data: {
					name: input.name,
					description: input.description,
					createdById: userId,
				},
				select: { id: true },
			});
			agentId = agent.id;
			created = true;

			await tx.agentConversation.update({
				where: { id: conversationId },
				data: { agentId, title: input.name },
			});
		} else {
			const [agent] = await tx.$queryRaw<
				Array<{
					status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "DELETED";
				}>
			>`
				SELECT status
				FROM "agentDefinition"
				WHERE id = ${agentId}
				FOR UPDATE
			`;
			if (!agent || agent.status === "DELETED") {
				throw new Error("This agent is unavailable.");
			}
			if (agent.status === "DRAFT") {
				await tx.agentDefinition.update({
					where: { id: agentId },
					data: { name: input.name, description: input.description },
				});
			}
		}

		const latest = await tx.agentVersion.findFirst({
			where: { agentId },
			orderBy: { number: "desc" },
			select: {
				id: true,
				number: true,
				status: true,
				instructions: true,
				manifest: true,
				modelId: true,
				modelContextWindowTokens: true,
			},
		});
		if (
			latest?.status === "READY" &&
			latest.instructions === input.instructions &&
			latest.modelId === model.id &&
			latest.modelContextWindowTokens === model.contextWindowTokens &&
			isDeepStrictEqual(latest.manifest, manifest)
		) {
			await persistArtifactSnapshots(tx, conversationId, latest.id, files);
			return {
				saved: true as const,
				agentId,
				versionId: latest.id,
				versionNumber: latest.number,
				status: latest.status,
			};
		}

		const number = (latest?.number ?? 0) + 1;
		const version = await tx.agentVersion.create({
			data: {
				agentId,
				number,
				status: "READY",
				instructions: input.instructions,
				manifest: manifest as Prisma.InputJsonValue,
				modelId: model.id,
				modelContextWindowTokens: model.contextWindowTokens,
				sandboxPolicy,
				validation: {
					status: "passed",
					checkedAt: now.toISOString(),
					capabilities: validation.capabilities,
				},
				sourceConversationId: conversationId,
				createdById: userId,
			},
			select: { id: true, number: true, status: true },
		});

		await persistArtifactSnapshots(tx, conversationId, version.id, files);

		await tx.agentTrigger.createMany({
			data: input.triggers.map((trigger, index) => ({
				agentId,
				versionId: version.id,
				type: trigger.type,
				name: trigger.name,
				config: manifestTriggers[index]?.config as Prisma.InputJsonValue,
				createdById: userId,
				nextRunAt: scheduleDate(trigger, now),
			})),
		});

		if (created) {
			await tx.agentAuditEvent.create({
				data: {
					agentId,
					actorUserId: userId,
					actorType: "USER",
					actorId: userId,
					type: "agent.created",
					summary: "Created a draft agent from a private builder chat",
					requestId: `builder:${conversationId}`,
				},
			});
		}

		await tx.agentAuditEvent.create({
			data: {
				agentId,
				versionId: version.id,
				actorUserId: userId,
				actorType: "USER",
				actorId: userId,
				type: "version.created",
				summary: `Prepared version ${number} for review`,
				requestId: version.id,
				after: { status: "READY", validation: "passed" },
			},
		});

		return {
			saved: true as const,
			agentId,
			versionId: version.id,
			versionNumber: version.number,
			status: version.status,
		};
	});
}

async function persistArtifactSnapshots(
	tx: Prisma.TransactionClient,
	conversationId: string,
	versionId: string,
	files: ReturnType<typeof artifactFiles>,
) {
	for (const file of files) {
		const latestArtifact = await tx.agentBuilderArtifact.findFirst({
			where: { conversationId, path: file.path },
			orderBy: { revision: "desc" },
			select: {
				id: true,
				versionId: true,
				revision: true,
				content: true,
				status: true,
			},
		});
		if (
			latestArtifact?.content === file.content &&
			latestArtifact.versionId === versionId &&
			latestArtifact.status === "READY"
		) {
			continue;
		}
		if (
			latestArtifact?.content === file.content &&
			latestArtifact.status === "WRITING" &&
			latestArtifact.versionId === null
		) {
			await tx.agentBuilderArtifact.update({
				where: { id: latestArtifact.id },
				data: { versionId, status: "READY" },
			});
			continue;
		}

		await tx.agentBuilderArtifact.create({
			data: {
				conversationId,
				versionId,
				path: file.path,
				language: file.language,
				content: file.content,
				previousContent: latestArtifact?.content ?? null,
				revision: (latestArtifact?.revision ?? 0) + 1,
				status: "READY",
			},
		});
	}
}

async function validateDraft(
	userId: string,
	input: DraftAgentInput,
	taggedResources: BuilderResource[],
) {
	const connections = await connectionStatus(userId);
	const issues: string[] = [];
	const capabilities = new Set(["crm.read"]);
	const resourceKeys = new Set<string>();
	const recordResources = input.resources.filter(
		(resource) => resource.kind !== "integration",
	);

	if (input.recordScope === "SELECTED" && recordResources.length === 0) {
		issues.push("Selected CRM scope needs at least one tagged record.");
	}
	if (input.recordScope === "WORKSPACE" && recordResources.length > 0) {
		issues.push("Workspace CRM scope cannot also list selected records.");
	}
	const taggedRecordKeys = new Set(
		taggedResources
			.filter((resource) => resource.kind !== "integration")
			.map((resource) => `${resource.kind}:${resource.id}`),
	);
	const taggedRecordLabels = new Map(
		taggedResources
			.filter((resource) => resource.kind !== "integration")
			.map((resource) => [`${resource.kind}:${resource.id}`, resource.label]),
	);
	for (const resource of recordResources) {
		const key = `${resource.kind}:${resource.id}`;
		if (!taggedRecordKeys.has(key)) {
			issues.push(`${resource.label} was not tagged in this builder chat.`);
			continue;
		}
		if (taggedRecordLabels.get(key) !== resource.label) {
			issues.push(
				`${resource.kind} ${resource.id} must use its exact tagged label.`,
			);
		}
	}

	for (const resource of input.resources) {
		const key = `${resource.kind}:${resource.id}`;
		if (resourceKeys.has(key)) {
			issues.push(`${resource.label} is listed more than once.`);
			continue;
		}
		resourceKeys.add(key);

		if (resource.kind !== "integration") continue;
		if (resource.id === "google:gmail" && !connections.gmail) {
			issues.push("Gmail is not connected for the chat owner.");
		}
		if (resource.id === "google:calendar" && !connections.calendar) {
			issues.push("Google Calendar is not connected for the chat owner.");
		}
		if (resource.id === "slack:workspace" && !connections.slack) {
			issues.push("Slack is not connected for this workspace.");
		}
		if (
			!["google:gmail", "google:calendar", "slack:workspace"].includes(
				resource.id,
			)
		) {
			issues.push(`${resource.label} is not an available integration.`);
			continue;
		}
		capabilities.add(`${resource.id}.read`);
	}

	const actionTypes = new Set<string>();
	for (const action of input.actions) {
		if (actionTypes.has(action.type)) {
			issues.push(`The ${action.type} action is listed more than once.`);
		}
		actionTypes.add(action.type);
		capabilities.add(action.type);
		if (action.type === AGENT_ACTION_TYPES.SLACK_MESSAGE_POST) {
			issues.push(...slackDestinationIssues(action.destination, connections));
		}
		if (action.type !== AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE) continue;
		if (new Set(action.activityTypes).size !== action.activityTypes.length) {
			issues.push("CRM activity permissions must not repeat an activity type.");
		}
	}
	if (!actionTypes.has(AGENT_ACTION_TYPES.RUN_SUMMARY)) {
		issues.push("An agent needs one run summary action.");
	}
	issues.push(...withheldActionIssues(input.instructions, input.actions));
	issues.push(...actionIntegrationIssues(input.actions, input.resources));

	const missingRecords = await missingResourceIds(input.resources);
	issues.push(
		...missingRecords.map(
			(resource) => `${resource.label} is no longer in the CRM.`,
		),
	);

	const eventTypes = new Set<CrmEventType>();
	let manualTriggers = 0;
	if (input.triggers.length === 0) {
		issues.push("An agent needs at least one trigger.");
	}
	for (const trigger of input.triggers) {
		if (trigger.type === "MANUAL") manualTriggers += 1;
		if (trigger.type === "SCHEDULE") {
			const next = Date.parse(trigger.nextRunAt ?? "");
			if (!Number.isFinite(next) || next <= Date.now()) {
				issues.push("A scheduled trigger needs a future next run time.");
			}
			if (
				!trigger.intervalMinutes ||
				trigger.intervalMinutes < 1 ||
				trigger.intervalMinutes > 525_600
			) {
				issues.push(
					"A scheduled trigger needs a recurrence from 1 minute to 1 year.",
				);
			}
		}
		if (trigger.type === "EVENT") {
			if (!trigger.event) {
				issues.push("An event trigger needs a supported CRM event.");
			} else if (eventTypes.has(trigger.event)) {
				issues.push(`The ${trigger.event} event is already a trigger.`);
			} else {
				eventTypes.add(trigger.event);
			}
			if (input.recordScope !== "WORKSPACE") {
				issues.push("Event triggers need workspace CRM scope.");
			}
		}
	}
	if (manualTriggers > 1) {
		issues.push("An agent needs at most one manual trigger.");
	}

	return {
		valid: issues.length === 0,
		issues,
		connections,
		capabilities: [...capabilities],
	};
}

async function connectionStatus(userId: string) {
	const [googleAccounts, slackAccount, workspaceMembers] = await Promise.all([
		db.account.findMany({
			where: { userId, providerId: "google" },
			select: { providerId: true, scope: true },
		}),
		db.account.findFirst({
			where: { providerId: "slack", accessToken: { not: null } },
			orderBy: { updatedAt: "desc" },
			select: { id: true },
		}),
		db.member.findMany({
			where: { organizationId: WORKSPACE_ID },
			orderBy: { user: { name: "asc" } },
			select: {
				user: {
					select: {
						name: true,
						email: true,
						slackMemberMatch: {
							select: {
								slackUserId: true,
								slackHandle: true,
								slackEmail: true,
							},
						},
					},
				},
			},
		}),
	]);
	if (slackAccount) void requestStaleSlackInventorySync();

	const slackChannels = await db.slackChannel.findMany({
		where: { available: true },
		orderBy: { name: "asc" },
		take: 100,
		select: { id: true, name: true, memberCount: true },
	});
	const scopes = new Set(
		googleAccounts.flatMap((account) => (account.scope ?? "").split(/[,\s]+/)),
	);
	const slackPeople = workspaceMembers.flatMap(({ user }) => {
		const match = user.slackMemberMatch;
		return match?.slackUserId && match.slackHandle
			? [
					{
						id: match.slackUserId,
						label: match.slackHandle,
						name: user.name,
						email: user.email,
						slackEmail: match.slackEmail,
					},
				]
			: [];
	});

	return {
		gmail: scopes.has(GMAIL_SCOPE),
		calendar: scopes.has(CALENDAR_SCOPE),
		slack: Boolean(slackAccount),
		slackChannels: slackChannels.map((channel) => ({
			id: channel.id,
			label: `#${channel.name}`,
			memberCount: channel.memberCount,
		})),
		slackPeople,
		crm: true,
	};
}

type SlackConnections = Awaited<ReturnType<typeof connectionStatus>>;

export function actionIntegrationIssues(
	actions: DraftAction[],
	resources: BuilderResource[],
): string[] {
	const integrations = new Set(
		resources
			.filter((resource) => resource.kind === "integration")
			.map((resource) => resource.id),
	);

	return actions.flatMap((action) => {
		const dependency = actionDependency(action.type);
		if (!dependency || integrations.has(dependency.resourceId)) return [];
		return [
			`Posting to ${dependency.label} needs ${dependency.label} in this agent's integrations.`,
		];
	});
}

const WITHHELD_ACTION = {
	failClosed:
		/\b(?:if|when)\s+(?:you(?:'re|\s+are)?\s+)?(?:unsure|uncertain|in\s+doubt)\b/i,
	deduplicates:
		/\balready\s+(?:been\s+)?(?:notified|sent|posted|fired|delivered)\b|\bsecond\s+time\b|\bdouble[-\s]?post\b/i,
	skips: /\bskip\b|\bsuppress(?:ed|es|ing)?\b/i,
	reports: /noActionNeeded/,
} as const;

export function withheldActionIssues(
	instructions: string,
	actions: DraftAction[],
): string[] {
	if (
		!actions.some((action) => action.type !== AGENT_ACTION_TYPES.RUN_SUMMARY)
	) {
		return [];
	}

	const issues: string[] = [];
	if (WITHHELD_ACTION.failClosed.test(instructions)) {
		issues.push(
			"The instructions resolve doubt by not acting. An agent asked to act must not withhold an action because it is unsure, so state the condition exactly or drop it.",
		);
	}
	if (WITHHELD_ACTION.deduplicates.test(instructions)) {
		issues.push(
			"The instructions decide for themselves whether the action already happened. The runtime claims every external action by an idempotency key and an event fires once per occurrence, so remove that check.",
		);
	}
	if (
		WITHHELD_ACTION.skips.test(instructions) &&
		!WITHHELD_ACTION.reports.test(instructions)
	) {
		issues.push(
			"The instructions can skip a declared action but never say to call finish_run with noActionNeeded, so a deliberate skip is recorded as a failed run.",
		);
	}
	return issues;
}

export function slackDestinationIssues(
	destination: Extract<
		DraftAction,
		{ type: typeof AGENT_ACTION_TYPES.SLACK_MESSAGE_POST }
	>["destination"],
	connections: Pick<SlackConnections, "slackChannels" | "slackPeople">,
): string[] {
	const noun = destination.kind === "user" ? "person" : "channel";
	const options =
		destination.kind === "user"
			? connections.slackPeople
			: connections.slackChannels;
	const option = options.find((entry) => entry.id === destination.id);
	if (!option) return [`The Slack ${noun} is not available to this workspace.`];
	if (option.label !== destination.label) {
		return [`The Slack ${noun} must use its exact inspected label.`];
	}
	return [];
}

async function describeResources(resources: BuilderResource[]) {
	return Promise.all(
		resources.map(async (resource) => {
			if (resource.kind === "company") {
				const row = await db.company.findUnique({
					where: { id: resource.id },
					select: { id: true, name: true, domain: true, industry: true },
				});
				return { ...resource, record: row };
			}
			if (resource.kind === "contact") {
				const row = await db.contact.findUnique({
					where: { id: resource.id },
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						title: true,
						company: { select: { id: true, name: true } },
					},
				});
				return { ...resource, record: row };
			}
			if (resource.kind === "deal") {
				const row = await db.deal.findUnique({
					where: { id: resource.id },
					select: {
						id: true,
						name: true,
						stage: true,
						amount: true,
						currency: true,
						company: { select: { id: true, name: true } },
					},
				});
				return {
					...resource,
					record: row
						? {
								...row,
								amount: row.amount === null ? null : Number(row.amount),
							}
						: null,
				};
			}
			return { ...resource, record: null };
		}),
	);
}

async function missingResourceIds(resources: BuilderResource[]) {
	const described = await describeResources(
		resources.filter((resource) => resource.kind !== "integration"),
	);
	return described.filter((resource) => !resource.record);
}

function resourcesOf(value: Prisma.JsonValue): BuilderResource[] {
	return taggedResources
		.parse(value)
		.resources.filter((resource) => resource !== null);
}

function uniqueResources(resources: BuilderResource[]): BuilderResource[] {
	return [
		...new Map(
			resources.map((resource) => [
				`${resource.kind}:${resource.id}`,
				resource,
			]),
		).values(),
	];
}

function scheduleDate(trigger: DraftTrigger, now: Date): Date | null {
	if (trigger.type !== "SCHEDULE") return null;
	const parsed = new Date(trigger.nextRunAt ?? "");
	return parsed > now ? parsed : null;
}

function artifactFiles(input: DraftAgentInput, manifestJson: string) {
	const triggerSummary = input.triggers
		.map((trigger) => `- ${trigger.summary}`)
		.join("\n");
	return [
		{
			path: "agent/README.md" as const,
			language: ARTIFACT_LANGUAGES["agent/README.md"],
			content: `# ${input.name}\n\n${input.description}\n\n## Triggers\n\n${triggerSummary}\n\n## Access\n\n${input.access.map((item) => `- ${item}`).join("\n") || "- CRM data in the approved scope"}\n`,
		},
		{
			path: "agent/instructions.md" as const,
			language: ARTIFACT_LANGUAGES["agent/instructions.md"],
			content: `${input.instructions.trim()}\n`,
		},
		{
			path: "agent/manifest.json" as const,
			language: ARTIFACT_LANGUAGES["agent/manifest.json"],
			content: `${manifestJson}\n`,
		},
	];
}

function assertSafeArtifact(content: string): void {
	const secretPatterns = [
		/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
		/\b(?:api[_-]?key|password|secret|access[_-]?token)\b\s*[:=]\s*["']?[a-z0-9_./+=-]{12,}/i,
		/\b(?:sk|pk)_(?:live|test)_[a-z0-9]{16,}/i,
	];

	if (secretPatterns.some((pattern) => pattern.test(content))) {
		throw new Error("Agent files cannot contain credentials or secret values.");
	}
}

function scopeSummary(
	recordScope: DraftAgentInput["recordScope"],
	resources: BuilderResource[],
): string {
	const records = resources.filter(
		(resource) => resource.kind !== "integration",
	);
	if (recordScope === "WORKSPACE") return "Workspace CRM records";
	return records.map((resource) => resource.label).join(" · ");
}
