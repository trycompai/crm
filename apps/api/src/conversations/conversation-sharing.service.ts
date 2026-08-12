import { randomBytes } from "node:crypto";
import { WORKSPACE_ID } from "@crm/auth";
import type { Db, Prisma } from "@crm/db";
import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { builderMessageWithAttachments } from "./conversation-attachments";
import { conversationShareTokenHash } from "./conversation-share-token";

@Injectable()
export class ConversationSharingService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async status(conversationId: string, userId: string) {
		await this.ownedBuilder(conversationId, userId);

		const share = await this.db.agentConversationShare.findFirst({
			where: {
				conversationId,
				revokedAt: null,
				OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
			},
			select: { createdAt: true, expiresAt: true },
		});

		return {
			enabled: share !== null,
			createdAt: share?.createdAt.toISOString() ?? null,
			expiresAt: share?.expiresAt?.toISOString() ?? null,
		};
	}

	async create(conversationId: string, userId: string) {
		const token = randomBytes(32).toString("base64url");
		const tokenHash = conversationShareTokenHash(token);

		const created = await this.db.$transaction(async (tx) => {
			if (!(await this.lockOwnedBuilder(tx, conversationId, userId))) {
				return false;
			}

			await tx.agentConversationShare.updateMany({
				where: { conversationId, revokedAt: null },
				data: { revokedAt: new Date() },
			});

			await tx.agentConversationShare.create({
				data: { conversationId, createdById: userId, tokenHash },
			});

			return true;
		});
		if (!created) this.missingBuilder(conversationId);

		return { token };
	}

	async revoke(conversationId: string, userId: string) {
		const revoked = await this.db.$transaction(async (tx) => {
			if (!(await this.lockOwnedBuilder(tx, conversationId, userId))) {
				return false;
			}

			await tx.agentConversationShare.updateMany({
				where: { conversationId, revokedAt: null },
				data: { revokedAt: new Date() },
			});

			return true;
		});
		if (!revoked) this.missingBuilder(conversationId);

		return { id: conversationId };
	}

	async resolve(token: string, userId: string) {
		await this.assertWorkspaceMember(userId);

		const share = await this.db.agentConversationShare.findFirst({
			where: {
				tokenHash: conversationShareTokenHash(token),
				revokedAt: null,
				OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
				conversation: { kind: "BUILDER" },
			},
			select: {
				conversation: {
					select: {
						id: true,
						title: true,
						sessionId: true,
						lastMessageAt: true,
						user: { select: { name: true } },
						agent: { select: { id: true, name: true, status: true } },
						builderArtifacts: {
							orderBy: [{ createdAt: "desc" }, { revision: "desc" }],
							take: 100,
							select: {
								id: true,
								versionId: true,
								path: true,
								language: true,
								content: true,
								previousContent: true,
								revision: true,
								status: true,
								createdAt: true,
							},
						},
						submissions: {
							orderBy: { createdAt: "asc" },
							select: {
								id: true,
								commandType: true,
								message: true,
								status: true,
								errorMessage: true,
								createdAt: true,
								attachments: {
									orderBy: { position: "asc" },
									select: {
										id: true,
										name: true,
										mediaType: true,
										size: true,
									},
								},
							},
						},
					},
				},
			},
		});

		if (!share) {
			throw new NotFoundException("That shared conversation is unavailable.");
		}

		const { conversation } = share;
		const events = await this.db.agentEvent.findMany({
			where: {
				OR: [
					{ conversationId: conversation.id },
					...(conversation.sessionId
						? [{ sessionId: conversation.sessionId }]
						: []),
				],
			},
			orderBy: [{ emittedAt: "desc" }, { id: "desc" }],
			take: 5000,
			select: { id: true, type: true, data: true, emittedAt: true },
		});

		return {
			id: conversation.id,
			title: conversation.title,
			ownerName: conversation.user.name,
			lastMessageAt: conversation.lastMessageAt.toISOString(),
			agent: conversation.agent,
			builderArtifacts: conversation.builderArtifacts.map((artifact) => ({
				...artifact,
				createdAt: artifact.createdAt.toISOString(),
			})),
			submissions: conversation.submissions.map(
				({ attachments, ...submission }) => ({
					...submission,
					message: builderMessageWithAttachments(
						submission.message,
						attachments,
						token,
					),
					createdAt: submission.createdAt.toISOString(),
				}),
			),
			events: events.reverse().map((event) => ({
				type: event.type,
				data: event.data,
				meta: { id: event.id, at: event.emittedAt.toISOString() },
			})),
		};
	}

	private async ownedBuilder(conversationId: string, userId: string) {
		const conversation = await this.db.agentConversation.findFirst({
			where: { id: conversationId, userId, kind: "BUILDER" },
			select: { id: true },
		});

		if (!conversation) {
			this.missingBuilder(conversationId);
		}

		return conversation;
	}

	private async lockOwnedBuilder(
		tx: Prisma.TransactionClient,
		conversationId: string,
		userId: string,
	): Promise<boolean> {
		const rows = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id
			FROM "agentConversation"
			WHERE id = ${conversationId}
			FOR UPDATE
		`;
		if (rows.length === 0) return false;

		return (
			(await tx.agentConversation.count({
				where: { id: conversationId, userId, kind: "BUILDER" },
			})) === 1
		);
	}

	private missingBuilder(conversationId: string): never {
		throw new NotFoundException(
			`No builder conversation with id ${conversationId}.`,
		);
	}

	private async assertWorkspaceMember(userId: string): Promise<void> {
		const member = await this.db.member.findUnique({
			where: {
				organizationId_userId: { organizationId: WORKSPACE_ID, userId },
			},
			select: { id: true },
		});

		if (!member) {
			throw new ForbiddenException(
				"This conversation belongs to another team.",
			);
		}
	}
}
