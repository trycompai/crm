import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import {
	builderConversationCreateInput,
	type ConversationSaveInput,
	conversationListInput,
	conversationSaveInput,
} from "../src/conversations/conversations.contracts";
import { ConversationsService } from "../src/conversations/conversations.service";

const suffix = process.env.TEST_RUN_ID ?? "conversations-spec";
const email = `conversation.subject.${suffix}@example.test`;
const userId = `user-${suffix}`;
const memberId = `conversation-member-${suffix}`;
const campaignName = `Conversations ${suffix}`;
const otherCampaignName = `other-${suffix}`;

let contactId: string;
let campaignId: string;
let otherCampaignId: string;
let nodeId: string;
let secondNodeId: string;
let service: ConversationsService;

beforeAll(async () => {
	await db.agentEvent.deleteMany({
		where: {
			OR: [
				{ sessionId: { startsWith: `builder-question-${suffix}` } },
				{ sessionId: { startsWith: `ses_${suffix}` } },
			],
		},
	});
	await db.agentConversation.deleteMany({ where: { userId } });
	await db.member.deleteMany({ where: { id: memberId } });
	await db.user.deleteMany({ where: { id: userId } });
	await db.contact.deleteMany({ where: { email } });
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		update: {},
		create: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
	});

	await db.user.create({
		data: { id: userId, name: "Test Rep", email: `${userId}@example.test` },
	});
	await db.member.create({
		data: {
			id: memberId,
			organizationId: WORKSPACE_ID,
			userId,
			role: "member",
			createdAt: new Date(),
		},
	});
	const contact = await db.contact.create({
		data: { firstName: "Conversation", lastName: "Subject", email },
		select: { id: true },
	});
	contactId = contact.id;

	await db.marketingCampaign.deleteMany({
		where: { name: { in: [campaignName, otherCampaignName] } },
	});
	const campaign = await db.marketingCampaign.create({
		data: { name: campaignName, kind: "DRIP" },
		select: { id: true },
	});
	campaignId = campaign.id;
	const otherCampaign = await db.marketingCampaign.create({
		data: { name: otherCampaignName, kind: "DRIP", status: "DRAFT" },
		select: { id: true },
	});
	otherCampaignId = otherCampaign.id;
	const [node, secondNode] = await Promise.all([
		db.marketingCampaignNode.create({
			data: { campaignId, kind: "EMAIL" },
			select: { id: true },
		}),
		db.marketingCampaignNode.create({
			data: { campaignId, kind: "EMAIL" },
			select: { id: true },
		}),
	]);
	nodeId = node.id;
	secondNodeId = secondNode.id;

	service = new ConversationsService(db);
});

afterAll(async () => {
	await db.agentEvent.deleteMany({
		where: {
			OR: [
				{ sessionId: { startsWith: `builder-question-${suffix}` } },
				{ sessionId: { startsWith: `ses_${suffix}` } },
			],
		},
	});
	await db.contact.deleteMany({ where: { email } });
	await db.agentConversation.deleteMany({ where: { userId } });
	await db.marketingCampaign.deleteMany({
		where: { name: { in: [campaignName, otherCampaignName] } },
	});
	await db.member.deleteMany({ where: { id: memberId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("ConversationsService", () => {
	it("starts a record with no history", async () => {
		expect(await service.list({ contactId }, userId)).toEqual([]);
	});

	it("saves a cursor and titles the thread from the opening question", async () => {
		await service.save(
			{
				contactId,
				sessionId: `ses_${suffix}_1`,
				continuationToken: "eve:token-1",
				streamIndex: 4,
				title: "Are they still there?",
				messageCount: 2,
			},
			userId,
		);

		const [conversation] = await service.list({ contactId }, userId);

		expect(conversation).toMatchObject({
			sessionId: `ses_${suffix}_1`,
			continuationToken: "eve:token-1",
			streamIndex: 4,
			title: "Are they still there?",
			messageCount: 2,
		});
	});

	it("moves the cursor without renaming the thread", async () => {
		await service.save(
			{
				contactId,
				sessionId: `ses_${suffix}_1`,
				continuationToken: "eve:token-2",
				streamIndex: 9,
				messageCount: 4,
			},
			userId,
		);

		const [conversation] = await service.list({ contactId }, userId);

		expect(conversation).toMatchObject({
			continuationToken: "eve:token-2",
			streamIndex: 9,
			title: "Are they still there?",
			messageCount: 4,
		});
	});

	it("reflects newly saved conversations immediately", async () => {
		const before = await service.list({ contactId }, userId);
		await service.save(
			{ contactId, sessionId: `ses_${suffix}_2`, messageCount: 1 },
			userId,
		);
		expect(await service.list({ contactId }, userId)).toHaveLength(
			before.length + 1,
		);
	});

	it("newest first, so reopening lands on the last thing you asked", async () => {
		const [first] = await service.list({ contactId }, userId);
		expect(first?.sessionId).toBe(`ses_${suffix}_2`);
	});

	it("keeps one rep's conversations out of another's", async () => {
		expect(await service.list({ contactId }, "somebody-else")).toEqual([]);
	});

	it("refuses a conversation that belongs to a record of neither kind", async () => {
		await expect(
			service.save({ sessionId: `ses_${suffix}_3` }, userId),
		).rejects.toThrow();
	});

	it("requires exactly one CRM record in list and save inputs", () => {
		expect(conversationListInput.safeParse({}).success).toBe(false);
		expect(
			conversationListInput.safeParse({ contactId, companyId: "company-1" })
				.success,
		).toBe(false);
		expect(
			conversationSaveInput.safeParse({
				contactId,
				dealId: "deal-1",
				sessionId: "session-1",
			}).success,
		).toBe(false);
	});

	it("does not mutate a conversation owned by another rep", async () => {
		const sessionId = `ses_${suffix}_ownership`;
		await service.save(
			{
				contactId,
				sessionId,
				continuationToken: "owner-token",
				streamIndex: 3,
			},
			userId,
		);

		let ownershipError: unknown;
		try {
			await service.save(
				{
					contactId,
					sessionId,
					continuationToken: "attacker-token",
					streamIndex: 99,
				},
				"somebody-else",
			);
		} catch (error) {
			ownershipError = error;
		}
		expect(ownershipError).toBeDefined();

		expect(
			await db.agentConversation.findUnique({
				where: { sessionId },
				select: { continuationToken: true, streamIndex: true },
			}),
		).toEqual({ continuationToken: "owner-token", streamIndex: 3 });
	});

	it("does not move an existing session to another CRM record", async () => {
		const sessionId = `ses_${suffix}_record`;
		await service.save({ contactId, sessionId }, userId);

		let recordError: unknown;
		try {
			await service.save({ companyId: "another-record", sessionId }, userId);
		} catch (error) {
			recordError = error;
		}
		expect(recordError).toBeInstanceOf(Error);
		expect((recordError as Error).message).toContain("cannot be moved");
	});

	it("deduplicates concurrent saves of the same record session", async () => {
		const sessionId = `ses_${suffix}_concurrent`;
		const results = await Promise.all(
			Array.from({ length: 4 }, () =>
				service.save({ contactId, sessionId, streamIndex: 7 }, userId),
			),
		);

		expect(new Set(results.map((result) => result.id)).size).toBe(1);
		expect(await db.agentConversation.count({ where: { sessionId } })).toBe(1);
	});

	it("does not treat a builder session as a record conversation", async () => {
		const builder = await service.createBuilder(
			{
				clientRequestId: crypto.randomUUID(),
				commandType: "CHAT",
				message: "Summarize this customer",
				resources: [],
				attachments: [],
			},
			userId,
		);
		const sessionId = `ses_${suffix}_builder`;
		await db.agentConversation.update({
			where: { id: builder.id },
			data: { sessionId },
		});

		let saveError: unknown;
		try {
			await service.save({ contactId, sessionId }, userId);
		} catch (error) {
			saveError = error;
		}
		expect(saveError).toBeDefined();
		expect(
			await db.agentConversation.findUnique({
				where: { id: builder.id },
				select: { kind: true, contactId: true },
			}),
		).toEqual({ kind: "BUILDER", contactId: null });
	});

	it("returns the newest event window in chronological order", async () => {
		const sessionId = `ses_${suffix}_events`;
		const saved = await service.save({ contactId, sessionId }, userId);
		const emittedAt = new Date("2026-08-05T12:00:00.000Z");
		await db.agentEvent.createMany({
			data: [0, 1, 2, 3].map((position) => ({
				id: `evt_${suffix}_window_${position}`,
				sessionId,
				contactId,
				type: `event.${position}`,
				data: {},
				emittedAt: new Date(emittedAt.getTime() + position),
			})),
		});

		expect(
			(await service.events({ id: saved.id, limit: 2 }, userId)).map(
				(event) => event.type,
			),
		).toEqual(["event.2", "event.3"]);
	});

	it("returns builder events from descendant sessions", async () => {
		const builder = await service.createBuilder(
			{
				clientRequestId: crypto.randomUUID(),
				commandType: "CREATE_AGENT",
				message: "Build an agent that asks one question",
				resources: [],
				attachments: [],
			},
			userId,
		);
		const rootSessionId = `builder-question-${suffix}-root`;
		await db.agentConversation.update({
			where: { id: builder.id },
			data: { sessionId: rootSessionId },
		});
		const emittedAt = new Date("2026-08-05T13:00:00.000Z");
		await db.agentEvent.createMany({
			data: [
				{
					id: `evt_${suffix}_builder_root`,
					sessionId: rootSessionId,
					conversationId: builder.id,
					type: "actions.requested",
					data: {},
					emittedAt,
				},
				{
					id: `evt_${suffix}_builder_child`,
					sessionId: `builder-question-${suffix}-child`,
					conversationId: builder.id,
					type: "input.requested",
					data: {},
					emittedAt: new Date(emittedAt.getTime() + 1),
				},
			],
		});

		expect(
			(await service.events({ id: builder.id, limit: 10 }, userId)).map(
				(event) => event.type,
			),
		).toEqual(["actions.requested", "input.requested"]);
	});

	it("forgets a conversation and the events behind it", async () => {
		const sessionId = `ses_${suffix}_delete`;
		const conversation = await service.save({ contactId, sessionId }, userId);

		await db.agentEvent.create({
			data: {
				id: `evt_${suffix}`,
				sessionId,
				contactId,
				type: "turn.completed",
				data: {},
				emittedAt: new Date(),
			},
		});
		await db.agentBuilderArtifact.create({
			data: {
				conversationId: conversation.id,
				path: "agent/instructions.md",
				language: "markdown",
				content: "Temporary draft",
				revision: 1,
			},
		});

		await service.remove(conversation.id, userId);

		expect(
			await db.agentConversation.findUnique({ where: { id: conversation.id } }),
		).toBeNull();
		expect(
			await db.agentEvent.count({
				where: { sessionId },
			}),
		).toBe(0);
		expect(
			await db.agentBuilderArtifact.count({
				where: { conversationId: conversation.id },
			}),
		).toBe(0);
	});

	it("will not let one rep delete another's conversation", async () => {
		const conversation = await service.save(
			{ contactId, sessionId: `ses_${suffix}_protected` },
			userId,
		);

		let removeError: unknown;
		try {
			await service.remove(conversation.id, "somebody-else");
		} catch (error) {
			removeError = error;
		}
		expect(removeError).toBeDefined();
		expect(
			await db.agentConversation.findUnique({ where: { id: conversation.id } }),
		).not.toBeNull();
	});

	it("persists the command type that controls agent creation", async () => {
		const chat = await service.createBuilder(
			{
				clientRequestId: crypto.randomUUID(),
				commandType: "CHAT",
				message: "Tell me about this customer",
				resources: [],
				attachments: [],
			},
			userId,
		);
		const creation = await service.createBuilder(
			{
				clientRequestId: crypto.randomUUID(),
				commandType: "CREATE_AGENT",
				message: "/Create agent Flag stalled deals",
				resources: [],
				attachments: [],
			},
			userId,
		);

		expect(
			(await service.builderById(chat.id, userId)).submissions[0],
		).toMatchObject({ commandType: "CHAT" });
		expect(
			(await service.builderById(creation.id, userId)).submissions[0],
		).toMatchObject({ commandType: "CREATE_AGENT" });
		expect((await service.builderById(chat.id, userId)).title).toBeNull();
		expect((await service.builderById(creation.id, userId)).title).toBeNull();
	});

	it("persists attachment bytes once and returns lightweight transcript metadata", async () => {
		const imageBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
		const textBytes = Buffer.from("account notes");
		const input = {
			clientRequestId: crypto.randomUUID(),
			commandType: "CHAT" as const,
			message: "Review these files",
			resources: [],
			attachments: [
				{
					name: "account.png",
					type: "image/png",
					size: imageBytes.byteLength,
					contentBase64: imageBytes.toString("base64"),
				},
				{
					name: "notes.txt",
					type: "text/plain",
					size: textBytes.byteLength,
					contentBase64: textBytes.toString("base64"),
				},
			],
		};
		const conversation = await service.createBuilder(input, userId);
		const detail = await service.builderById(conversation.id, userId);
		const submission = detail.submissions.find(
			(row) => row.clientRequestId === input.clientRequestId,
		);
		const message = recordOf(submission?.message);
		const attachments = arrayOf(message.attachments).map(recordOf);

		expect(JSON.stringify(message)).not.toContain("contentBase64");
		expect(attachments).toEqual([
			expect.objectContaining({
				name: "account.png",
				type: "image/png",
				size: imageBytes.byteLength,
				previewUrl: expect.stringContaining("/api/conversations/attachments/"),
			}),
			expect.objectContaining({
				name: "notes.txt",
				type: "text/plain",
				size: textBytes.byteLength,
				previewUrl: null,
			}),
		]);
		const imageId = attachments[0]?.id;
		if (typeof imageId !== "string") throw new Error("Missing attachment id");
		const image = await service.attachment(imageId, userId);
		expect(Buffer.from(image.content)).toEqual(imageBytes);
		expect(image).toMatchObject({
			name: "account.png",
			mediaType: "image/png",
			previewable: true,
		});
	});

	it("rejects attachment metadata that does not match its bytes", () => {
		expect(
			builderConversationCreateInput.safeParse({
				clientRequestId: crypto.randomUUID(),
				message: "Review this file",
				attachments: [
					{
						name: "notes.txt",
						type: "text/plain",
						size: 99,
						contentBase64: Buffer.from("notes").toString("base64"),
					},
				],
			}).success,
		).toBe(false);
	});

	it("reuses persisted attachment bytes when retrying a failed agent turn", async () => {
		const bytes = Buffer.from("retry-safe attachment");
		const conversation = await service.createBuilder(
			{
				clientRequestId: crypto.randomUUID(),
				commandType: "CHAT",
				message: "Read this attachment",
				resources: [],
				attachments: [
					{
						name: "retry.txt",
						type: "text/plain",
						size: bytes.byteLength,
						contentBase64: bytes.toString("base64"),
					},
				],
			},
			userId,
		);
		const original = await service.builderById(conversation.id, userId);
		const originalMessage = recordOf(original.submissions[0]?.message);
		const originalAttachment = recordOf(
			arrayOf(originalMessage.attachments)[0],
		);

		await service.submitBuilder(
			{
				id: conversation.id,
				clientRequestId: crypto.randomUUID(),
				commandType: "CHAT",
				message: "Try reading it again",
				resources: [],
				attachments: [
					{
						id: String(originalAttachment.id),
						name: String(originalAttachment.name),
						type: String(originalAttachment.type),
						size: Number(originalAttachment.size),
						previewUrl: null,
					},
				],
			},
			userId,
		);

		const detail = await service.builderById(conversation.id, userId);
		const retryMessage = recordOf(detail.submissions.at(-1)?.message);
		const retryAttachment = recordOf(arrayOf(retryMessage.attachments)[0]);
		expect(retryAttachment.id).not.toBe(originalAttachment.id);
		const stored = await service.attachment(String(retryAttachment.id), userId);
		expect(Buffer.from(stored.content)).toEqual(bytes);
	});

	it("does not copy an attachment from another private conversation", async () => {
		const bytes = Buffer.from("private attachment");
		const source = await service.createBuilder(
			{
				clientRequestId: crypto.randomUUID(),
				commandType: "CHAT",
				message: "Private source",
				resources: [],
				attachments: [
					{
						name: "private.txt",
						type: "text/plain",
						size: bytes.byteLength,
						contentBase64: bytes.toString("base64"),
					},
				],
			},
			userId,
		);
		const target = await service.createBuilder(
			{
				clientRequestId: crypto.randomUUID(),
				commandType: "CHAT",
				message: "Different private chat",
				resources: [],
				attachments: [],
			},
			userId,
		);
		const sourceDetail = await service.builderById(source.id, userId);
		const sourceMessage = recordOf(sourceDetail.submissions[0]?.message);
		const attachment = recordOf(arrayOf(sourceMessage.attachments)[0]);

		let submitError: unknown;
		try {
			await service.submitBuilder(
				{
					id: target.id,
					clientRequestId: crypto.randomUUID(),
					commandType: "CHAT",
					message: "Copy data across chats",
					resources: [],
					attachments: [
						{
							id: String(attachment.id),
							name: String(attachment.name),
							type: String(attachment.type),
							size: Number(attachment.size),
							previewUrl: null,
						},
					],
				},
				userId,
			);
		} catch (error) {
			submitError = error;
		}
		expect(submitError).toBeInstanceOf(Error);
		expect((submitError as Error).message).toContain("no longer available");
	});

	it("deduplicates concurrent builder creation retries", async () => {
		const clientRequestId = crypto.randomUUID();
		const results = await Promise.all(
			Array.from({ length: 4 }, () =>
				service.createBuilder(
					{
						clientRequestId,
						commandType: "CHAT",
						message: "Prepare a renewal brief",
						resources: [],
						attachments: [],
					},
					userId,
				),
			),
		);

		expect(new Set(results.map((result) => result.id)).size).toBe(1);
		expect(
			await db.agentConversationSubmission.count({
				where: { clientRequestId },
			}),
		).toBe(1);
	});

	it("deduplicates concurrent builder message retries", async () => {
		const conversation = await service.createBuilder(
			{
				clientRequestId: crypto.randomUUID(),
				commandType: "CHAT",
				message: "Review the account history",
				resources: [],
				attachments: [],
			},
			userId,
		);
		const clientRequestId = crypto.randomUUID();
		const results = await Promise.all(
			Array.from({ length: 4 }, () =>
				service.submitBuilder(
					{
						id: conversation.id,
						clientRequestId,
						commandType: "CHAT",
						message: "Summarize the open risks",
						resources: [],
						attachments: [],
					},
					userId,
				),
			),
		);

		expect(new Set(results.map((result) => result.id)).size).toBe(1);
		expect(
			await db.agentConversationSubmission.count({
				where: { clientRequestId },
			}),
		).toBe(1);
	});

	it("queues a pending builder answer for the CRM-owned Eve channel", async () => {
		const conversation = await service.createBuilder(
			{
				clientRequestId: crypto.randomUUID(),
				commandType: "CREATE_AGENT",
				message: "/Create agent Flag overdue invoices",
				resources: [],
				attachments: [],
			},
			userId,
		);
		const sessionId = `builder-question-${suffix}-1`;
		await db.agentConversation.update({
			where: { id: conversation.id },
			data: {
				sessionId,
				continuationToken: `crm:builder:${conversation.id}`,
				pendingInputRequest: {
					kind: "question",
					requestId: "question-1",
					prompt: "Where should this go?",
					display: "select",
					options: [{ id: "crm-task", label: "Create a CRM task" }],
				},
			},
		});

		expect(
			(await service.builderById(conversation.id, userId)).pendingQuestion,
		).toMatchObject({
			requestId: "question-1",
			prompt: "Where should this go?",
		});

		const response = await service.answerBuilderQuestion(
			{
				id: conversation.id,
				clientRequestId: crypto.randomUUID(),
				requestId: "question-1",
				optionId: "crm-task",
			},
			userId,
		);
		const submission = await db.agentConversationSubmission.findUnique({
			where: { id: response.id },
			select: {
				commandType: true,
				inputRequestId: true,
				message: true,
				status: true,
			},
		});

		expect(submission).toMatchObject({
			commandType: "CREATE_AGENT",
			inputRequestId: "question-1",
			status: "PENDING",
			message: {
				text: "Create a CRM task",
				inputResponse: {
					requestId: "question-1",
					optionId: "crm-task",
				},
			},
		});
	});

	it("rejects an answer when the conversation has no durable question", async () => {
		const conversation = await service.createBuilder(
			{
				clientRequestId: crypto.randomUUID(),
				commandType: "CREATE_AGENT",
				message: "/Create agent Notify the team",
				resources: [],
				attachments: [],
			},
			userId,
		);
		await db.agentConversation.update({
			where: { id: conversation.id },
			data: {
				sessionId: `builder-question-${suffix}-recovery`,
				continuationToken: `builder:${conversation.id}`,
			},
		});

		let error: Error | null = null;
		try {
			await service.answerBuilderQuestion(
				{
					id: conversation.id,
					clientRequestId: crypto.randomUUID(),
					requestId: "question-only-in-eve",
					optionId: "continue-building",
				},
				userId,
			);
		} catch (caught) {
			error = caught as Error;
		}
		expect(error?.message).toBe(
			"The agent is no longer waiting for that answer.",
		);
	});

	it("accepts only one concurrent answer to a follow-up request", async () => {
		const conversation = await service.createBuilder(
			{
				clientRequestId: crypto.randomUUID(),
				commandType: "CREATE_AGENT",
				message: "/Create agent Prepare meeting briefs",
				resources: [],
				attachments: [],
			},
			userId,
		);
		const sessionId = `builder-question-${suffix}-2`;
		await db.agentConversation.update({
			where: { id: conversation.id },
			data: {
				sessionId,
				continuationToken: `crm:builder:${conversation.id}`,
				pendingInputRequest: {
					kind: "question",
					requestId: "question-concurrent",
					prompt: "Which output?",
					display: "select",
					options: [
						{ id: "note", label: "Create a note" },
						{ id: "task", label: "Create a task" },
					],
				},
			},
		});

		const results = await Promise.allSettled([
			service.answerBuilderQuestion(
				{
					id: conversation.id,
					clientRequestId: crypto.randomUUID(),
					requestId: "question-concurrent",
					optionId: "note",
				},
				userId,
			),
			service.answerBuilderQuestion(
				{
					id: conversation.id,
					clientRequestId: crypto.randomUUID(),
					requestId: "question-concurrent",
					optionId: "task",
				},
				userId,
			),
		]);

		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected"),
		).toHaveLength(1);
		expect(
			await db.agentConversationSubmission.count({
				where: {
					conversationId: conversation.id,
					inputRequestId: "question-concurrent",
				},
			}),
		).toBe(1);
	});
});

describe("node-scoped conversations", () => {
	it("files a node conversation under its campaign and its node", async () => {
		const sessionId = `ses_${suffix}_node`;
		await service.save(
			{ campaignId, campaignNodeId: nodeId, sessionId },
			userId,
		);

		expect(
			await db.agentConversation.findUnique({
				where: { sessionId },
				select: { campaignId: true, campaignNodeId: true },
			}),
		).toEqual({ campaignId, campaignNodeId: nodeId });
	});

	it("keeps node threads out of the campaign list, and the campaign's out of the node's", async () => {
		const campaignSession = `ses_${suffix}_campaign_level`;
		await service.save({ campaignId, sessionId: campaignSession }, userId);

		const campaignThreads = await service.list({ campaignId }, userId);
		expect(campaignThreads.map((row) => row.sessionId)).toEqual([
			campaignSession,
		]);

		const nodeThreads = await service.list(
			{ campaignId, campaignNodeId: nodeId },
			userId,
		);
		expect(nodeThreads.map((row) => row.sessionId)).toEqual([
			`ses_${suffix}_node`,
		]);

		expect(
			await service.list({ campaignId, campaignNodeId: secondNodeId }, userId),
		).toEqual([]);
	});

	it("refuses a node scope without its campaign", () => {
		expect(
			conversationListInput.safeParse({ campaignNodeId: "node-1" }).success,
		).toBe(false);
		expect(
			conversationSaveInput.safeParse({
				campaignNodeId: "node-1",
				sessionId: "session-1",
			}).success,
		).toBe(false);
		expect(
			conversationListInput.safeParse({
				campaignId: "campaign-1",
				campaignNodeId: "node-1",
			}).success,
		).toBe(true);
	});

	it("saves under the campaign when the step is already gone", async () => {
		const sessionId = `ses_${suffix}_node_missing`;

		await service.save(
			{ campaignId, campaignNodeId: `${nodeId}-deleted`, sessionId },
			userId,
		);

		expect(
			await db.agentConversation.findUnique({
				where: { sessionId },
				select: { campaignId: true, campaignNodeId: true },
			}),
		).toEqual({ campaignId, campaignNodeId: null });
	});

	it("saves under the campaign when the step goes after the check", async () => {
		const doomed = await db.marketingCampaignNode.create({
			data: { campaignId, kind: "EMAIL" },
			select: { id: true },
		});
		await db.marketingCampaignNode.delete({ where: { id: doomed.id } });

		const racing = new ConversationsService(db);
		Object.assign(racing, {
			withLiveNode: (input: ConversationSaveInput) => Promise.resolve(input),
		});

		const sessionId = `ses_${suffix}_node_raced`;
		await racing.save(
			{ campaignId, campaignNodeId: doomed.id, sessionId },
			userId,
		);

		expect(
			await db.agentConversation.findUnique({
				where: { sessionId },
				select: { campaignId: true, campaignNodeId: true },
			}),
		).toEqual({ campaignId, campaignNodeId: null });
	});

	it("refuses a conversation whose campaign is gone", async () => {
		const racing = new ConversationsService(db);
		Object.assign(racing, {
			withLiveNode: (input: ConversationSaveInput) => Promise.resolve(input),
		});

		let saveError: unknown;
		try {
			await racing.save(
				{
					campaignId: `${campaignId}-deleted`,
					sessionId: `ses_${suffix}_campaign_gone`,
				},
				userId,
			);
		} catch (error) {
			saveError = error;
		}

		expect((saveError as Error).message).toContain("no longer exists");
	});

	it("does not file a step that belongs to another campaign", async () => {
		const sessionId = `ses_${suffix}_node_foreign`;

		await service.save(
			{ campaignId: otherCampaignId, campaignNodeId: nodeId, sessionId },
			userId,
		);

		expect(
			await db.agentConversation.findUnique({
				where: { sessionId },
				select: { campaignNodeId: true },
			}),
		).toEqual({ campaignNodeId: null });
	});

	it("does not move a conversation between a campaign and its nodes", async () => {
		const sessionId = `ses_${suffix}_node_move`;
		await service.save(
			{ campaignId, campaignNodeId: nodeId, sessionId },
			userId,
		);

		for (const scope of [
			{ campaignId },
			{ campaignId, campaignNodeId: secondNodeId },
		]) {
			let moveError: unknown;
			try {
				await service.save({ ...scope, sessionId }, userId);
			} catch (error) {
				moveError = error;
			}
			expect((moveError as Error).message).toContain("cannot be moved");
		}

		const campaignSession = `ses_${suffix}_campaign_move`;
		await service.save({ campaignId, sessionId: campaignSession }, userId);

		let ontoNodeError: unknown;
		try {
			await service.save(
				{ campaignId, campaignNodeId: nodeId, sessionId: campaignSession },
				userId,
			);
		} catch (error) {
			ontoNodeError = error;
		}
		expect((ontoNodeError as Error).message).toContain("cannot be moved");
	});

	it("moves a node conversation's cursor inside its own scope", async () => {
		const sessionId = `ses_${suffix}_node_cursor`;
		await service.save(
			{ campaignId, campaignNodeId: nodeId, sessionId },
			userId,
		);
		await service.save(
			{
				campaignId,
				campaignNodeId: nodeId,
				sessionId,
				continuationToken: "eve:node-token",
				streamIndex: 5,
				messageCount: 3,
			},
			userId,
		);

		const [thread] = await service.list(
			{ campaignId, campaignNodeId: nodeId },
			userId,
		);
		expect(thread).toMatchObject({
			sessionId,
			continuationToken: "eve:node-token",
			streamIndex: 5,
			messageCount: 3,
		});
	});
});

describe("shell-scoped conversations", () => {
	let shellId: string;

	beforeAll(async () => {
		await db.marketingPartial.deleteMany({
			where: { name: `Conversations shell ${suffix}` },
		});
		const shell = await db.marketingPartial.create({
			data: {
				kind: "HEADER",
				name: `Conversations shell ${suffix}`,
				document: { version: 1, blocks: [] },
			},
			select: { id: true },
		});
		shellId = shell.id;
	});

	afterAll(async () => {
		await db.marketingPartial.deleteMany({
			where: { name: `Conversations shell ${suffix}` },
		});
	});

	it("accepts a shell as a record scope", () => {
		expect(
			conversationListInput.safeParse({ shellId: "shell-1" }).success,
		).toBe(true);
		expect(
			conversationSaveInput.safeParse({
				shellId: "shell-1",
				sessionId: "session-1",
			}).success,
		).toBe(true);
	});

	it("files and lists a shell conversation under its shell", async () => {
		const sessionId = `ses_${suffix}_shell`;
		await service.save({ shellId, sessionId }, userId);

		expect(
			await db.agentConversation.findUnique({
				where: { sessionId },
				select: { shellId: true, campaignId: true },
			}),
		).toEqual({ shellId, campaignId: null });

		const threads = await service.list({ shellId }, userId);
		expect(threads.map((row) => row.sessionId)).toEqual([sessionId]);
	});

	it("does not move a shell conversation to another record", async () => {
		const sessionId = `ses_${suffix}_shell_move`;
		await service.save({ shellId, sessionId }, userId);

		let moveError: unknown;
		try {
			await service.save({ campaignId, sessionId }, userId);
		} catch (error) {
			moveError = error;
		}
		expect((moveError as Error).message).toContain("cannot be moved");
	});
});

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function arrayOf(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}
