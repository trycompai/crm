import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	saveBuilderDraft,
	writeBuilderArtifact,
} from "../agent/lib/builder-runtime";
import { setBuilderConversationTitle } from "../agent/lib/conversation-title";

const suffix = crypto.randomUUID();
const userId = `builder-runtime-user-${suffix}`;
let conversationId = "";
let agentId = "";
const conversationIds: string[] = [];

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Builder Runtime Test",
			email: `${userId}@example.test`,
		},
	});
	const conversation = await db.agentConversation.create({
		data: { kind: "BUILDER", userId },
		select: { id: true },
	});
	conversationId = conversation.id;
	conversationIds.push(conversation.id);
});

afterAll(async () => {
	const agentIds = (
		await db.agentDefinition.findMany({
			where: { createdById: userId },
			select: { id: true },
		})
	).map((agent) => agent.id);
	if (agentIds.length > 0) {
		await db.agentBuilderArtifact.deleteMany({
			where: {
				OR: [
					{ conversationId: { in: conversationIds } },
					{ version: { agentId: { in: agentIds } } },
				],
			},
		});
		await db.agentAuditEvent.deleteMany({
			where: { agentId: { in: agentIds } },
		});
		await db.agentTrigger.deleteMany({
			where: { agentId: { in: agentIds } },
		});
		await db.agentDefinition.updateMany({
			where: { id: { in: agentIds } },
			data: { currentVersionId: null },
		});
		await db.agentVersion.deleteMany({
			where: { agentId: { in: agentIds } },
		});
		await db.agentDefinition.deleteMany({
			where: { id: { in: agentIds } },
		});
	}
	await db.agentConversation.deleteMany({
		where: { id: { in: conversationIds } },
	});
	await db.user.deleteMany({ where: { id: userId } });
});

describe("builder persistence", () => {
	it("sets a concise model-authored title only once", async () => {
		const conversation = await db.agentConversation.create({
			data: { kind: "BUILDER", userId },
			select: { id: true },
		});
		conversationIds.push(conversation.id);

		expect(
			await setBuilderConversationTitle(
				conversation.id,
				userId,
				"  “Flag stale pipeline deals”  ",
			),
		).toEqual({ saved: true, title: "Flag stale pipeline deals" });
		expect(
			await setBuilderConversationTitle(
				conversation.id,
				userId,
				"Replace the title",
			),
		).toEqual({ saved: false, title: "Flag stale pipeline deals" });
	});

	it("serializes concurrent file writes and draft saves", async () => {
		const instructions =
			"When manually triggered, review the approved CRM scope and write a concise run summary without changing external systems.";
		const writes = await Promise.all(
			Array.from({ length: 4 }, () =>
				writeBuilderArtifact(
					conversationId,
					userId,
					"agent/instructions.md",
					`${instructions}\n`,
				),
			),
		);

		expect(new Set(writes.map((write) => write.id)).size).toBe(1);
		expect(new Set(writes.map((write) => write.revision))).toEqual(
			new Set([1]),
		);

		const input = {
			name: "Meeting prep",
			description: "Prepare a concise CRM meeting brief.",
			instructions,
			trigger: {
				type: "MANUAL" as const,
				name: "Manual",
				summary: "Run when a rep requests meeting preparation.",
			},
			recordScope: "WORKSPACE" as const,
			resources: [],
			actions: [
				{
					type: "run.summary" as const,
					provider: "crm" as const,
					summary: "Write a run summary.",
				},
			],
			access: ["Read CRM records in the approved scope"],
		};
		const saves = await Promise.all(
			Array.from({ length: 4 }, () =>
				saveBuilderDraft(conversationId, userId, input),
			),
		);
		const saved = saves.flatMap((save) => (save.saved ? [save] : []));

		expect(saved).toHaveLength(4);
		expect(new Set(saved.map((save) => save.agentId)).size).toBe(1);
		expect(new Set(saved.map((save) => save.versionId)).size).toBe(1);
		agentId = saved[0]?.agentId ?? "";
		expect(await db.agentDefinition.count({ where: { id: agentId } })).toBe(1);
		expect(await db.agentVersion.count({ where: { agentId } })).toBe(1);

		const artifact = await db.agentBuilderArtifact.findFirstOrThrow({
			where: { conversationId, path: "agent/instructions.md" },
			orderBy: { revision: "desc" },
			select: { revision: true, status: true, versionId: true },
		});
		expect(artifact).toEqual({
			revision: 1,
			status: "READY",
			versionId: saved[0]?.versionId,
		});
	});

	it("assigns consecutive versions to distinct concurrent drafts", async () => {
		const conversation = await db.agentConversation.create({
			data: { kind: "BUILDER", userId },
			select: { id: true },
		});
		conversationIds.push(conversation.id);
		const base = {
			description: "Prepare a distinct CRM run summary.",
			trigger: {
				type: "MANUAL" as const,
				name: "Manual",
				summary: "Run when a rep requests it.",
			},
			recordScope: "WORKSPACE" as const,
			resources: [],
			actions: [
				{
					type: "run.summary" as const,
					provider: "crm" as const,
					summary: "Write a run summary.",
				},
			],
			access: ["Read workspace CRM records"],
		};
		const saves = await Promise.all(
			Array.from({ length: 4 }, (_, index) =>
				saveBuilderDraft(conversation.id, userId, {
					...base,
					name: `Concurrent draft ${index + 1}`,
					instructions: `When manually triggered, prepare distinct CRM summary ${index + 1} without changing external systems.`,
				}),
			),
		);
		const saved = saves.flatMap((save) => (save.saved ? [save] : []));

		expect(saved).toHaveLength(4);
		expect(new Set(saved.map((save) => save.agentId)).size).toBe(1);
		expect(saved.map((save) => save.versionNumber).sort()).toEqual([
			1, 2, 3, 4,
		]);
		expect(
			await db.agentVersion.count({
				where: { agentId: saved[0]?.agentId },
			}),
		).toBe(4);
	});

	it("fails closed on unsupported integrations and ambiguous record scope", async () => {
		const conversation = await db.agentConversation.create({
			data: { kind: "BUILDER", userId },
			select: { id: true },
		});
		conversationIds.push(conversation.id);
		const base = {
			name: "Safe scope",
			description: "Keep a bounded CRM summary.",
			instructions:
				"When manually triggered, read only the approved CRM scope and return a concise summary without changing CRM records.",
			trigger: {
				type: "MANUAL" as const,
				name: "Manual",
				summary: "Run only when a teammate requests it.",
			},
			actions: [
				{
					type: "run.summary" as const,
					provider: "crm" as const,
					summary: "Return a run summary.",
				},
			],
			access: ["Read approved CRM records"],
		};

		const unsupported = await saveBuilderDraft(conversation.id, userId, {
			...base,
			recordScope: "WORKSPACE",
			resources: [
				{ kind: "integration", id: "google:drive", label: "Google Drive" },
			],
		});
		expect(unsupported).toMatchObject({
			saved: false,
			issues: ["Google Drive is not an available integration."],
		});

		const ambiguous = await saveBuilderDraft(conversation.id, userId, {
			...base,
			recordScope: "SELECTED",
			resources: [],
		});
		expect(ambiguous).toMatchObject({
			saved: false,
			issues: ["Selected CRM scope needs at least one tagged record."],
		});
	});

	it("keeps a live definition unchanged until a revised version is deployed", async () => {
		const conversation = await db.agentConversation.create({
			data: { kind: "BUILDER", userId },
			select: { id: true },
		});
		conversationIds.push(conversation.id);

		const original = {
			name: "Workspace pulse",
			description: "Report the workspace company count.",
			instructions:
				"When manually triggered, read workspace companies and return the company count in a concise run summary without changing CRM records.",
			trigger: {
				type: "MANUAL" as const,
				name: "Manual",
				summary: "Run when a teammate requests a workspace pulse.",
			},
			recordScope: "WORKSPACE" as const,
			resources: [],
			actions: [
				{
					type: "run.summary" as const,
					provider: "crm" as const,
					summary: "Write a run summary.",
				},
			],
			access: ["Read workspace CRM records"],
		};
		const first = await saveBuilderDraft(conversation.id, userId, original);
		if (!first.saved) throw new Error("Initial draft was not saved");

		await db.$transaction([
			db.agentVersion.update({
				where: { id: first.versionId },
				data: { status: "DEPLOYED" },
			}),
			db.agentDefinition.update({
				where: { id: first.agentId },
				data: {
					name: "Workspace pulse",
					description: "Team-visible description",
					status: "LIVE",
					currentVersionId: first.versionId,
				},
			}),
		]);

		const revised = {
			...original,
			name: "Workspace health pulse",
			description: "Report company and open-deal counts.",
		};
		await writeBuilderArtifact(
			conversation.id,
			userId,
			"agent/README.md",
			`# ${revised.name}\n\n${revised.description}\n\n## Trigger\n\n${revised.trigger.summary}\n\n## Access\n\n- ${revised.access[0]}\n`,
		);
		const second = await saveBuilderDraft(conversation.id, userId, revised);
		if (!second.saved) throw new Error("Revised draft was not saved");

		const [definition, version, artifacts] = await Promise.all([
			db.agentDefinition.findUniqueOrThrow({
				where: { id: first.agentId },
				select: {
					name: true,
					description: true,
					status: true,
					currentVersionId: true,
				},
			}),
			db.agentVersion.findUniqueOrThrow({
				where: { id: second.versionId },
				select: { number: true, status: true, manifest: true },
			}),
			db.agentBuilderArtifact.findMany({
				where: { conversationId: conversation.id, versionId: second.versionId },
				select: { path: true, status: true },
			}),
		]);

		expect(second.versionId).not.toBe(first.versionId);
		expect(definition).toEqual({
			name: "Workspace pulse",
			description: "Team-visible description",
			status: "LIVE",
			currentVersionId: first.versionId,
		});
		expect(version).toMatchObject({
			number: 2,
			status: "READY",
			manifest: {
				name: revised.name,
				description: revised.description,
			},
		});
		expect(artifacts).toHaveLength(3);
		expect(artifacts.every((artifact) => artifact.status === "READY")).toBe(
			true,
		);
		expect(
			await db.agentBuilderArtifact.count({
				where: { conversationId: conversation.id, status: "WRITING" },
			}),
		).toBe(0);
	});
});
