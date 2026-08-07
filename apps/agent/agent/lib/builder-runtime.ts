import { isDeepStrictEqual } from "node:util";
import { db, type Prisma } from "@crm/db";
import { readAgentModel } from "@crm/db/settings";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export type BuilderResource = {
	kind: "integration" | "company" | "contact" | "deal";
	id: string;
	label: string;
};

export type DraftTrigger = {
	type: "MANUAL" | "SCHEDULE";
	name: string;
	summary: string;
	nextRunAt?: string | null;
	intervalMinutes?: number | null;
};

export type DraftAction =
	| {
			type: "crm.activity.create";
			provider: "crm";
			summary: string;
			activityTypes: ("NOTE" | "TASK")[];
	  }
	| {
			type: "run.summary";
			provider: "crm";
			summary: string;
	  };

export type DraftAgentInput = {
	name: string;
	description: string;
	instructions: string;
	trigger: DraftTrigger;
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

const ARTIFACT_LANGUAGES: Record<BuilderArtifactPath, string> = {
	"agent/README.md": "markdown",
	"agent/instructions.md": "markdown",
	"agent/manifest.json": "json",
};

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
	const nextRunAt = scheduleDate(input.trigger, now);
	const manifest = {
		kind: "crm-team-agent",
		name: input.name,
		description: input.description,
		trigger: {
			type: input.trigger.type,
			name: input.trigger.name,
			summary: input.trigger.summary,
			config:
				input.trigger.type === "SCHEDULE"
					? {
							intervalMinutes: input.trigger.intervalMinutes,
							nextRunAt: nextRunAt?.toISOString(),
						}
					: {},
		},
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
	const files = artifactFiles(input, manifest);
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

		await tx.agentTrigger.create({
			data: {
				agentId,
				versionId: version.id,
				type: input.trigger.type,
				name: input.trigger.name,
				config: manifest.trigger.config as Prisma.InputJsonValue,
				createdById: userId,
				nextRunAt,
			},
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
		if (!["google:gmail", "google:calendar"].includes(resource.id)) {
			issues.push(`${resource.label} is not an available integration.`);
			continue;
		}
		capabilities.add(`${resource.id}.read`);
	}

	for (const action of input.actions) {
		capabilities.add(action.type);
		if (action.type !== "crm.activity.create") continue;
		if (new Set(action.activityTypes).size !== action.activityTypes.length) {
			issues.push("CRM activity permissions must not repeat an activity type.");
		}
	}

	const missingRecords = await missingResourceIds(input.resources);
	issues.push(
		...missingRecords.map(
			(resource) => `${resource.label} is no longer in the CRM.`,
		),
	);

	if (input.trigger.type === "SCHEDULE") {
		const next = Date.parse(input.trigger.nextRunAt ?? "");
		if (!Number.isFinite(next) || next <= Date.now()) {
			issues.push("A scheduled agent needs a future next run time.");
		}
		if (
			!input.trigger.intervalMinutes ||
			input.trigger.intervalMinutes < 1 ||
			input.trigger.intervalMinutes > 525_600
		) {
			issues.push(
				"A scheduled agent needs a recurrence from 1 minute to 1 year.",
			);
		}
	}

	return {
		valid: issues.length === 0,
		issues,
		connections,
		capabilities: [...capabilities],
	};
}

async function connectionStatus(userId: string) {
	const accounts = await db.account.findMany({
		where: { userId, providerId: "google" },
		select: { scope: true },
	});
	const scopes = new Set(
		accounts.flatMap((account) => (account.scope ?? "").split(/[,\s]+/)),
	);

	return {
		gmail: scopes.has(GMAIL_SCOPE),
		calendar: scopes.has(CALENDAR_SCOPE),
		crm: true,
	};
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

function resourcesOf(value: unknown): BuilderResource[] {
	if (!value || typeof value !== "object" || !("resources" in value)) return [];
	const resources = (value as { resources?: unknown }).resources;
	if (!Array.isArray(resources)) return [];

	return resources.flatMap((resource) => {
		if (!resource || typeof resource !== "object") return [];
		const row = resource as Record<string, unknown>;
		if (
			!["integration", "company", "contact", "deal"].includes(
				String(row.kind),
			) ||
			typeof row.id !== "string" ||
			typeof row.label !== "string"
		) {
			return [];
		}
		return [resource as BuilderResource];
	});
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

function artifactFiles(input: DraftAgentInput, manifest: object) {
	return [
		{
			path: "agent/README.md" as const,
			language: ARTIFACT_LANGUAGES["agent/README.md"],
			content: `# ${input.name}\n\n${input.description}\n\n## Trigger\n\n${input.trigger.summary}\n\n## Access\n\n${input.access.map((item) => `- ${item}`).join("\n") || "- CRM data in the approved scope"}\n`,
		},
		{
			path: "agent/instructions.md" as const,
			language: ARTIFACT_LANGUAGES["agent/instructions.md"],
			content: `${input.instructions.trim()}\n`,
		},
		{
			path: "agent/manifest.json" as const,
			language: ARTIFACT_LANGUAGES["agent/manifest.json"],
			content: `${JSON.stringify(manifest, null, 2)}\n`,
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
