import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { z } from "zod";
import { ConversationSharingService } from "../src/conversations/conversation-sharing.service";
import { ConversationsService } from "../src/conversations/conversations.service";

const record = z.record(z.string(), z.unknown()).catch({});

const list = z.array(z.unknown()).catch([]);

const suffix = crypto.randomUUID();
const userId = `share-user-${suffix}`;
const outsiderId = `share-outsider-${suffix}`;
const viewerId = `share-viewer-${suffix}`;
const memberId = `share-member-${suffix}`;
const viewerMemberId = `share-viewer-member-${suffix}`;
const sessionId = `share-session-${suffix}`;
let conversationId = "";
let attachmentId = "";
const service = new ConversationSharingService(db);
const conversations = new ConversationsService(db);

beforeAll(async () => {
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
	await db.user.createMany({
		data: [
			{ id: userId, name: "Share Owner", email: `${userId}@example.test` },
			{
				id: outsiderId,
				name: "Share Outsider",
				email: `${outsiderId}@example.test`,
			},
			{
				id: viewerId,
				name: "Share Viewer",
				email: `${viewerId}@example.test`,
			},
		],
	});
	await db.member.createMany({
		data: [
			{
				id: memberId,
				organizationId: WORKSPACE_ID,
				userId,
				role: "member",
				createdAt: new Date(),
			},
			{
				id: viewerMemberId,
				organizationId: WORKSPACE_ID,
				userId: viewerId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
	const conversation = await db.agentConversation.create({
		data: {
			kind: "BUILDER",
			userId,
			title: "Share safely",
			sessionId,
		},
		select: { id: true },
	});
	conversationId = conversation.id;
	const submission = await db.agentConversationSubmission.create({
		data: {
			conversationId,
			submittedById: userId,
			clientRequestId: crypto.randomUUID(),
			message: {
				text: "Review the image",
				resources: [],
				attachments: [{ name: "shared.png", type: "image/png", size: 4 }],
			},
			attachments: {
				create: {
					name: "shared.png",
					mediaType: "image/png",
					size: 4,
					content: Buffer.from([1, 2, 3, 4]),
					position: 0,
				},
			},
		},
		select: { attachments: { select: { id: true } } },
	});
	attachmentId = submission.attachments[0]?.id ?? "";
});

afterAll(async () => {
	await db.agentEvent.deleteMany({ where: { sessionId } });
	await db.agentConversation.deleteMany({ where: { id: conversationId } });
	await db.member.deleteMany({
		where: { id: { in: [memberId, viewerMemberId] } },
	});
	await db.user.deleteMany({
		where: { id: { in: [userId, outsiderId, viewerId] } },
	});
});

describe("conversation sharing", () => {
	it("keeps a builder chat private until its owner creates a link", async () => {
		let unavailable: unknown;
		try {
			await service.resolve("x".repeat(43), userId);
		} catch (error) {
			unavailable = error;
		}
		expect(unavailable).toBeDefined();

		const { token } = await service.create(conversationId, userId);
		expect(await service.resolve(token, userId)).toMatchObject({
			id: conversationId,
			title: "Share safely",
			ownerName: "Share Owner",
		});
	});

	it("allows only the owner to create or revoke a chat link", async () => {
		for (const operation of [
			() => service.create(conversationId, outsiderId),
			() => service.revoke(conversationId, outsiderId),
		]) {
			let denied: unknown;
			try {
				await operation();
			} catch (error) {
				denied = error;
			}
			expect(denied).toBeDefined();
		}
	});

	it("keeps exactly one active link across concurrent replacements", async () => {
		const results = await Promise.all(
			Array.from({ length: 4 }, () => service.create(conversationId, userId)),
		);
		const activeShares = await db.agentConversationShare.findMany({
			where: { conversationId, revokedAt: null },
			select: { tokenHash: true },
		});

		expect(activeShares).toHaveLength(1);
		const resolutions = await Promise.allSettled(
			results.map(({ token }) => service.resolve(token, userId)),
		);
		expect(
			resolutions.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
	});

	it("requires workspace membership to open a valid shared link", async () => {
		const { token } = await service.create(conversationId, userId);
		let denied: unknown;
		try {
			await service.resolve(token, outsiderId);
		} catch (error) {
			denied = error;
		}

		expect(denied).toBeDefined();
	});

	it("authorizes attachment bytes with the active share token only", async () => {
		const { token } = await service.create(conversationId, userId);
		const shared = await service.resolve(token, viewerId);
		const message = record.parse(shared.submissions[0]?.message);
		const attachment = record.parse(list.parse(message.attachments)[0]);
		expect(attachment.previewUrl).toBe(
			`/api/conversations/attachments/${attachmentId}?share=${encodeURIComponent(token)}`,
		);
		expect(
			Buffer.from(
				(await conversations.attachment(attachmentId, viewerId, token)).content,
			),
		).toEqual(Buffer.from([1, 2, 3, 4]));

		await service.revoke(conversationId, userId);
		let revokedError: unknown;
		try {
			await conversations.attachment(attachmentId, viewerId, token);
		} catch (error) {
			revokedError = error;
		}
		expect((revokedError as Error).message).toBe(
			"That attachment is unavailable.",
		);
	});

	it("revokes the active link", async () => {
		const { token } = await service.create(conversationId, userId);
		await service.revoke(conversationId, userId);

		expect(
			await db.agentConversationShare.count({
				where: { conversationId, revokedAt: null },
			}),
		).toBe(0);
		let unavailable: unknown;
		try {
			await service.resolve(token, userId);
		} catch (error) {
			unavailable = error;
		}
		expect(unavailable).toBeDefined();
	});
});
