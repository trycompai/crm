import { WORKSPACE_ID } from "@crm/auth";
import { type Db, type Prisma, Prisma as PrismaNamespace } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
	Optional,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import {
	builderMessageWithAttachments,
	isPreviewableImage,
} from "./conversation-attachments";
import { conversationShareTokenHash } from "./conversation-share-token";
import { violatedForeignKey } from "./conversations.constraints";
import type {
	BuilderConversationCreateInput,
	BuilderConversationSubmitInput,
	BuilderQuestionResponseInput,
	ConversationEventsInput,
	ConversationListInput,
	ConversationSaveInput,
	RecordScope,
} from "./conversations.contracts";
import { recordScopeIds } from "./conversations.contracts";

export interface ConversationSummary {
	id: string;
	sessionId: string;
	continuationToken: string | null;
	streamIndex: number;
	title: string | null;
	messageCount: number;
	lastMessageAt: string;
}

export interface BuilderConversationSummary {
	id: string;
	sessionId: string | null;
	continuationToken: string | null;
	streamIndex: number;
	title: string | null;
	messageCount: number;
	lastMessageAt: string;
	lastAssistantAt: string | null;
	unread: boolean;
	state: "working" | "unread" | "deployed" | "idle";
	agent: {
		id: string;
		name: string;
		status: string;
	} | null;
}

type ExistingBuilderRequest = {
	id: string;
	conversationId: string;
	submittedById: string;
	conversation: { id: string; userId: string; kind: string };
};

@Injectable()
export class ConversationsService {
	private readonly logger = new Logger(ConversationsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Optional() private readonly agent?: AgentTriggerService,
	) {}

	async list(
		input: ConversationListInput,
		userId: string,
	): Promise<ConversationSummary[]> {
		const recordId = this.recordId(input);
		this.logger.debug({ message: "Conversation list read", recordId });

		const rows = await this.db.agentConversation.findMany({
			where: {
				userId,
				contactId: input.contactId ?? undefined,
				companyId: input.companyId ?? undefined,
				dealId: input.dealId ?? undefined,
				campaignId: input.campaignId ?? undefined,
				campaignNodeId: input.campaignId
					? (input.campaignNodeId ?? null)
					: undefined,
				segmentId: input.segmentId ?? undefined,
				templateId: input.templateId ?? undefined,
				shellId: input.shellId ?? undefined,
			},
			orderBy: { lastMessageAt: "desc" },
			take: 20,
			select: {
				id: true,
				sessionId: true,
				continuationToken: true,
				streamIndex: true,
				title: true,
				messageCount: true,
				lastMessageAt: true,
			},
		});

		const summaries = rows.flatMap((row) =>
			row.sessionId
				? [
						{
							...row,
							sessionId: row.sessionId,
							lastMessageAt: row.lastMessageAt.toISOString(),
						},
					]
				: [],
		);

		return summaries;
	}

	async listBuilder(userId: string): Promise<BuilderConversationSummary[]> {
		await this.assertWorkspaceMember(userId);
		const rows = await this.db.agentConversation.findMany({
			where: { userId, kind: "BUILDER" },
			orderBy: { lastMessageAt: "desc" },
			take: 50,
			select: {
				id: true,
				sessionId: true,
				continuationToken: true,
				streamIndex: true,
				title: true,
				messageCount: true,
				lastMessageAt: true,
				lastAssistantAt: true,
				lastReadAt: true,
				agent: { select: { id: true, name: true, status: true } },
				_count: {
					select: {
						submissions: { where: { commandType: "CREATE_AGENT" } },
					},
				},
				submissions: {
					where: { status: { in: ["PENDING", "SENDING"] } },
					select: { id: true },
					take: 1,
				},
			},
		});

		return rows.map((row) => {
			const unread = Boolean(
				row.lastAssistantAt &&
					(!row.lastReadAt || row.lastAssistantAt > row.lastReadAt),
			);
			const working =
				row.submissions.length > 0 ||
				Boolean(row.sessionId && !row.continuationToken);

			return {
				id: row.id,
				sessionId: row.sessionId,
				continuationToken: row.continuationToken,
				streamIndex: row.streamIndex,
				title: row.title,
				messageCount: row.messageCount,
				lastMessageAt: row.lastMessageAt.toISOString(),
				lastAssistantAt: row.lastAssistantAt?.toISOString() ?? null,
				unread,
				state:
					row._count.submissions > 0 && row.agent?.status === "LIVE"
						? "deployed"
						: working
							? "working"
							: unread
								? "unread"
								: "idle",
				agent: row.agent,
			};
		});
	}

	async builderResources(q: string, userId: string) {
		await this.assertWorkspaceMember(userId);

		const search = q.trim();
		const contains = search
			? { contains: search, mode: "insensitive" as const }
			: undefined;

		const [companies, contacts, deals, slackAccount] = await Promise.all([
			this.db.company.findMany({
				where: contains ? { name: contains } : undefined,
				orderBy: { lastActivityAt: { sort: "desc", nulls: "last" } },
				take: 6,
				select: { id: true, name: true, domain: true, logoUrl: true },
			}),
			this.db.contact.findMany({
				where: contains
					? {
							OR: [
								{ firstName: contains },
								{ lastName: contains },
								{ email: contains },
							],
						}
					: undefined,
				orderBy: { lastActivityAt: { sort: "desc", nulls: "last" } },
				take: 6,
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					imageUrl: true,
					company: { select: { name: true } },
				},
			}),
			this.db.deal.findMany({
				where: contains ? { name: contains } : undefined,
				orderBy: { lastActivityAt: { sort: "desc", nulls: "last" } },
				take: 6,
				select: {
					id: true,
					name: true,
					company: { select: { name: true, logoUrl: true } },
				},
			}),
			this.db.account.findFirst({
				where: { providerId: "slack", accessToken: { not: null } },
				select: { id: true },
			}),
		]);

		return [
			...(slackAccount && (!search || "slack".includes(search.toLowerCase()))
				? [
						{
							kind: "integration" as const,
							id: "slack:workspace",
							label: "Slack",
							detail: "Connected workspace",
							imageUrl: null,
						},
					]
				: []),
			...companies.map((company) => ({
				kind: "company" as const,
				id: company.id,
				label: company.name,
				detail: company.domain,
				imageUrl: company.logoUrl,
			})),
			...contacts.map((contact) => ({
				kind: "contact" as const,
				id: contact.id,
				label: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
				detail: contact.company?.name ?? contact.email,
				imageUrl: contact.imageUrl,
			})),
			...deals.map((deal) => ({
				kind: "deal" as const,
				id: deal.id,
				label: deal.name,
				detail: deal.company.name,
				imageUrl: deal.company.logoUrl,
			})),
		];
	}

	async builderById(id: string, userId: string) {
		await this.assertWorkspaceMember(userId);
		const row = await this.db.agentConversation.findFirst({
			where: { id, userId, kind: "BUILDER" },
			select: {
				id: true,
				sessionId: true,
				continuationToken: true,
				pendingInputRequest: true,
				streamIndex: true,
				title: true,
				messageCount: true,
				lastMessageAt: true,
				lastAssistantAt: true,
				lastReadAt: true,
				agent: {
					select: {
						id: true,
						name: true,
						description: true,
						status: true,
						createdBy: { select: { id: true, name: true } },
						currentVersion: {
							select: {
								id: true,
								number: true,
								status: true,
								manifest: true,
								modelId: true,
								sandboxPolicy: true,
								deployedAt: true,
							},
						},
						triggers: {
							orderBy: { createdAt: "asc" },
							select: {
								id: true,
								type: true,
								name: true,
								config: true,
								enabled: true,
								nextRunAt: true,
							},
						},
					},
				},
				createdVersions: {
					orderBy: { number: "desc" },
					take: 1,
					select: {
						id: true,
						number: true,
						status: true,
						instructions: true,
						manifest: true,
						modelId: true,
						sandboxPolicy: true,
						validation: true,
						createdAt: true,
					},
				},
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
				feedback: {
					where: { userId },
					select: { messageId: true, rating: true },
				},
				submissions: {
					orderBy: { createdAt: "asc" },
					select: {
						id: true,
						clientRequestId: true,
						commandType: true,
						message: true,
						status: true,
						errorCode: true,
						errorMessage: true,
						createdAt: true,
						sentAt: true,
						acceptedAt: true,
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
		});

		if (!row) {
			throw new NotFoundException(`No builder conversation with id ${id}.`);
		}

		const { pendingInputRequest, ...conversation } = row;

		return {
			...conversation,
			pendingQuestion: pendingBuilderQuestionOf(pendingInputRequest),
			lastMessageAt: row.lastMessageAt.toISOString(),
			lastAssistantAt: row.lastAssistantAt?.toISOString() ?? null,
			lastReadAt: row.lastReadAt?.toISOString() ?? null,
			agent: row.agent
				? {
						...row.agent,
						currentVersion: row.agent.currentVersion
							? {
									...row.agent.currentVersion,
									deployedAt:
										row.agent.currentVersion.deployedAt?.toISOString() ?? null,
								}
							: null,
						triggers: row.agent.triggers.map((trigger) => ({
							...trigger,
							nextRunAt: trigger.nextRunAt?.toISOString() ?? null,
						})),
					}
				: null,
			createdVersions: row.createdVersions.map((version) => ({
				...version,
				createdAt: version.createdAt.toISOString(),
			})),
			builderArtifacts: row.builderArtifacts.map((artifact) => ({
				...artifact,
				createdAt: artifact.createdAt.toISOString(),
			})),
			submissions: row.submissions.map(({ attachments, ...submission }) => ({
				...submission,
				message: builderMessageWithAttachments(submission.message, attachments),
				createdAt: submission.createdAt.toISOString(),
				sentAt: submission.sentAt?.toISOString() ?? null,
				acceptedAt: submission.acceptedAt?.toISOString() ?? null,
			})),
		};
	}

	async createBuilder(
		input: BuilderConversationCreateInput,
		userId: string,
	): Promise<{ id: string }> {
		await this.assertWorkspaceMember(userId);
		const existing = await this.requestByClientId(input.clientRequestId);

		if (existing) {
			return this.replayBuilderCreation(existing, userId);
		}

		const now = new Date();
		try {
			const conversation = await this.db.agentConversation.create({
				data: {
					kind: "BUILDER",
					userId,
					title: null,
					lastReadAt: now,
					lastMessageAt: now,
					submissions: {
						create: {
							submittedById: userId,
							clientRequestId: input.clientRequestId,
							commandType: input.commandType,
							message: this.builderMessage(input),
							attachments: {
								create: this.attachmentWrites(input.attachments),
							},
						},
					},
				},
				select: { id: true },
			});

			this.agent?.builderConversationQueued();
			return conversation;
		} catch (error) {
			if (!isUniqueConstraint(error)) throw error;
			const winner = await this.requestByClientId(input.clientRequestId);
			if (!winner) throw error;
			return this.replayBuilderCreation(winner, userId);
		}
	}

	async submitBuilder(
		input: BuilderConversationSubmitInput,
		userId: string,
	): Promise<{ id: string }> {
		await this.assertWorkspaceMember(userId);
		const existing = await this.requestByClientId(input.clientRequestId);

		if (existing) {
			return this.replayBuilderSubmission(existing, input.id, userId);
		}

		const conversation = await this.db.agentConversation.findFirst({
			where: { id: input.id, userId, kind: "BUILDER" },
			select: { id: true },
		});

		if (!conversation) {
			throw new NotFoundException(
				`No builder conversation with id ${input.id}.`,
			);
		}

		try {
			const attachmentWrites = await this.submissionAttachmentWrites(
				input,
				userId,
			);
			const submission = await this.db.$transaction(async (tx) => {
				const created = await tx.agentConversationSubmission.create({
					data: {
						conversationId: input.id,
						submittedById: userId,
						clientRequestId: input.clientRequestId,
						commandType: input.commandType,
						message: this.builderMessage(input),
						attachments: {
							create: attachmentWrites,
						},
					},
					select: { id: true },
				});

				await tx.agentConversation.update({
					where: { id: input.id },
					data: { lastMessageAt: new Date(), lastReadAt: new Date() },
				});

				return created;
			});

			this.agent?.builderConversationQueued();
			return submission;
		} catch (error) {
			if (!isUniqueConstraint(error)) throw error;
			const winner = await this.requestByClientId(input.clientRequestId);
			if (!winner) throw error;
			return this.replayBuilderSubmission(winner, input.id, userId);
		}
	}

	async answerBuilderQuestion(
		input: BuilderQuestionResponseInput,
		userId: string,
	): Promise<{ id: string }> {
		await this.assertWorkspaceMember(userId);
		const existing = await this.requestByClientId(input.clientRequestId);

		if (existing) {
			return this.replayBuilderSubmission(existing, input.id, userId);
		}

		const conversation = await this.db.agentConversation.findFirst({
			where: { id: input.id, userId, kind: "BUILDER" },
			select: {
				id: true,
				sessionId: true,
				continuationToken: true,
				pendingInputRequest: true,
			},
		});

		if (!conversation) {
			throw new NotFoundException(
				`No builder conversation with id ${input.id}.`,
			);
		}

		if (!conversation.sessionId || !conversation.continuationToken) {
			throw new BadRequestException(
				"The agent is no longer waiting for that answer.",
			);
		}

		const question = pendingBuilderQuestionOf(conversation.pendingInputRequest);
		if (!question) {
			throw new BadRequestException(
				"The agent is no longer waiting for that answer.",
			);
		}
		if (question.requestId !== input.requestId) {
			throw new BadRequestException(
				"That follow-up question is no longer active.",
			);
		}

		const options = question.options;
		const selected = input.optionId
			? options.find((option) => option.id === input.optionId)
			: null;

		if (input.optionId && !selected) {
			throw new BadRequestException(
				"That answer is not available for this question.",
			);
		}

		const acceptsText = question.allowFreeform || question.display === "text";
		if (input.text && !acceptsText) {
			throw new BadRequestException(
				"Choose one of the available answers for this question.",
			);
		}

		const answer = input.optionId ?? input.text;
		if (!answer) {
			throw new BadRequestException("Choose an answer before submitting.");
		}

		const displayText =
			typeof selected?.label === "string" ? selected.label : answer;
		const inputResponse = input.optionId
			? { requestId: input.requestId, optionId: input.optionId }
			: { requestId: input.requestId, text: input.text };
		try {
			const submission = await this.db.$transaction(async (tx) => {
				const created = await tx.agentConversationSubmission.create({
					data: {
						conversationId: input.id,
						submittedById: userId,
						clientRequestId: input.clientRequestId,
						inputRequestId: input.requestId,
						commandType: "CREATE_AGENT",
						message: {
							text: displayText,
							resources: [],
							attachments: [],
							inputResponse,
						},
					},
					select: { id: true },
				});

				await tx.agentConversation.update({
					where: { id: input.id },
					data: { lastMessageAt: new Date(), lastReadAt: new Date() },
				});

				return created;
			});

			this.agent?.builderConversationQueued();
			return submission;
		} catch (error) {
			if (!isUniqueConstraint(error)) throw error;

			const winner = await this.requestByClientId(input.clientRequestId);
			if (winner) {
				return this.replayBuilderSubmission(winner, input.id, userId);
			}

			const answered = await this.db.agentConversationSubmission.findFirst({
				where: {
					conversationId: input.id,
					inputRequestId: input.requestId,
				},
				select: { id: true },
			});
			if (answered) {
				throw new BadRequestException(
					"That follow-up question has already been answered.",
				);
			}

			throw error;
		}
	}

	async markRead(id: string, userId: string): Promise<{ id: string }> {
		await this.assertWorkspaceMember(userId);
		const updated = await this.db.agentConversation.updateMany({
			where: { id, userId, kind: "BUILDER" },
			data: { lastReadAt: new Date() },
		});

		if (updated.count === 0) {
			throw new NotFoundException(`No builder conversation with id ${id}.`);
		}

		return { id };
	}

	async attachment(
		id: string,
		userId: string,
		shareToken?: string,
	): Promise<{
		name: string;
		mediaType: string;
		content: Uint8Array;
		previewable: boolean;
	}> {
		await this.assertWorkspaceMember(userId);
		const share = shareToken?.trim();
		const row = await this.db.agentConversationAttachment.findFirst({
			where: {
				id,
				submission: {
					conversation: {
						kind: "BUILDER",
						OR: [
							{ userId },
							...(share
								? [
										{
											shares: {
												some: {
													tokenHash: conversationShareTokenHash(share),
													revokedAt: null,
													OR: [
														{ expiresAt: null },
														{ expiresAt: { gt: new Date() } },
													],
												},
											},
										},
									]
								: []),
						],
					},
				},
			},
			select: { name: true, mediaType: true, content: true },
		});

		if (!row) {
			throw new NotFoundException("That attachment is unavailable.");
		}

		return {
			...row,
			previewable: isPreviewableImage(row.mediaType),
		};
	}

	async rateBuilderResponse(
		input: { id: string; messageId: string; rating: "UP" | "DOWN" | null },
		userId: string,
	) {
		await this.assertWorkspaceMember(userId);
		const conversation = await this.db.agentConversation.findFirst({
			where: { id: input.id, userId, kind: "BUILDER" },
			select: { id: true },
		});

		if (!conversation) {
			throw new NotFoundException(
				`No builder conversation with id ${input.id}.`,
			);
		}

		const key = {
			conversationId_userId_messageId: {
				conversationId: input.id,
				userId,
				messageId: input.messageId,
			},
		};

		if (!input.rating) {
			await this.db.agentConversationFeedback.deleteMany({
				where: key.conversationId_userId_messageId,
			});
			return { id: input.messageId, rating: null };
		}

		await this.db.agentConversationFeedback.upsert({
			where: key,
			create: {
				conversationId: input.id,
				userId,
				messageId: input.messageId,
				rating: input.rating,
			},
			update: { rating: input.rating },
		});

		return { id: input.messageId, rating: input.rating };
	}

	async save(
		rawInput: ConversationSaveInput,
		userId: string,
	): Promise<{ id: string }> {
		let input = await this.withLiveNode(rawInput);
		const recordId = this.recordId(input);
		const updateExisting = async (existing: {
			id: string;
			kind: string;
			userId: string;
			contactId: string | null;
			companyId: string | null;
			dealId: string | null;
			campaignId: string | null;
			campaignNodeId: string | null;
			segmentId: string | null;
			templateId: string | null;
			shellId: string | null;
		}) => {
			if (existing.userId !== userId || existing.kind !== "RECORD") {
				throw new NotFoundException(
					`No record conversation with session ${input.sessionId}.`,
				);
			}

			const existingRecordId =
				existing.contactId ??
				existing.companyId ??
				existing.dealId ??
				existing.campaignId ??
				existing.segmentId ??
				existing.templateId ??
				existing.shellId;
			if (
				existingRecordId !== recordId ||
				existing.campaignNodeId !== (input.campaignNodeId ?? null)
			) {
				throw new BadRequestException(
					"A conversation cannot be moved to another CRM record.",
				);
			}

			const updated = await this.db.agentConversation.updateMany({
				where: {
					id: existing.id,
					kind: "RECORD",
					userId,
					contactId: input.contactId ?? null,
					companyId: input.companyId ?? null,
					dealId: input.dealId ?? null,
					campaignId: input.campaignId ?? null,
					campaignNodeId: input.campaignNodeId ?? null,
					segmentId: input.segmentId ?? null,
					templateId: input.templateId ?? null,
					shellId: input.shellId ?? null,
				},
				data: {
					continuationToken: input.continuationToken ?? null,
					streamIndex: input.streamIndex ?? 0,
					messageCount: input.messageCount ?? 0,
					lastMessageAt: new Date(),
				},
			});

			if (updated.count !== 1) {
				throw new NotFoundException(
					`No record conversation with session ${input.sessionId}.`,
				);
			}

			return { id: existing.id };
		};

		const existing = await this.db.agentConversation.findUnique({
			where: { sessionId: input.sessionId },
			select: {
				id: true,
				kind: true,
				userId: true,
				contactId: true,
				companyId: true,
				dealId: true,
				campaignId: true,
				campaignNodeId: true,
				segmentId: true,
				templateId: true,
				shellId: true,
			},
		});

		const createScoped = async (): Promise<{ id: string }> => {
			try {
				return await this.db.agentConversation.create({
					data: {
						sessionId: input.sessionId,
						continuationToken: input.continuationToken ?? null,
						streamIndex: input.streamIndex ?? 0,
						title: input.title?.slice(0, 120) ?? null,
						messageCount: input.messageCount ?? 0,
						userId,
						contactId: input.contactId ?? null,
						companyId: input.companyId ?? null,
						dealId: input.dealId ?? null,
						campaignId: input.campaignId ?? null,
						campaignNodeId: input.campaignNodeId ?? null,
						segmentId: input.segmentId ?? null,
						templateId: input.templateId ?? null,
						shellId: input.shellId ?? null,
					},
					select: { id: true },
				});
			} catch (error) {
				if (!isUniqueConstraint(error)) throw error;
				const winner = await this.db.agentConversation.findUnique({
					where: { sessionId: input.sessionId },
					select: {
						id: true,
						kind: true,
						userId: true,
						contactId: true,
						companyId: true,
						dealId: true,
						campaignId: true,
						campaignNodeId: true,
						segmentId: true,
						templateId: true,
						shellId: true,
					},
				});
				if (!winner) throw error;
				return updateExisting(winner);
			}
		};

		const createDroppingLostNode = async (
			droppable: boolean,
		): Promise<{ id: string }> => {
			try {
				return await createScoped();
			} catch (error) {
				const violated = violatedForeignKey(error);

				if (droppable && violated === "campaignNode" && input.campaignNodeId) {
					this.logger.debug({
						message: "Conversation saved without a step deleted mid-save",
						campaignId: input.campaignId,
					});
					input = { ...input, campaignNodeId: undefined };

					return createDroppingLostNode(false);
				}

				if (violated) {
					throw new BadRequestException(
						"That conversation points at a record that no longer exists.",
					);
				}

				throw error;
			}
		};

		return existing
			? await updateExisting(existing)
			: await createDroppingLostNode(true);
	}

	async events(input: ConversationEventsInput, userId: string) {
		const conversation = await this.db.agentConversation.findUnique({
			where: { id: input.id },
			select: { kind: true, sessionId: true, userId: true },
		});

		if (!conversation || conversation.userId !== userId) {
			throw new NotFoundException(`No conversation with id ${input.id}.`);
		}
		if (conversation.kind === "BUILDER") {
			await this.assertWorkspaceMember(userId);
		}

		const eventWhere: Prisma.AgentEventWhereInput =
			conversation.kind === "BUILDER"
				? {
						OR: [
							{ conversationId: input.id },
							...(conversation.sessionId
								? [{ sessionId: conversation.sessionId }]
								: []),
						],
					}
				: conversation.sessionId
					? { sessionId: conversation.sessionId }
					: { id: { in: [] } };

		const events = await this.db.agentEvent.findMany({
			where: eventWhere,
			orderBy: [{ emittedAt: "desc" }, { id: "desc" }],
			take: input.limit,
			select: { id: true, type: true, data: true, emittedAt: true },
		});

		return events.reverse().map((event) => ({
			type: event.type,
			data: event.data,
			meta: { id: event.id, at: event.emittedAt.toISOString() },
		}));
	}

	async remove(id: string, userId: string): Promise<{ id: string }> {
		const conversation = await this.db.agentConversation.findUnique({
			where: { id },
			select: {
				id: true,
				kind: true,
				userId: true,
				sessionId: true,
			},
		});

		if (!conversation || conversation.userId !== userId) {
			throw new NotFoundException(`No conversation with id ${id}.`);
		}
		if (conversation.kind === "BUILDER") {
			await this.assertWorkspaceMember(userId);
		}

		await this.db.$transaction(async (tx) => {
			await tx.agentBuilderArtifact.deleteMany({
				where: { conversationId: id, versionId: null },
			});
			await tx.agentEvent.deleteMany({
				where: {
					OR: [
						{ conversationId: id },
						...(conversation.sessionId
							? [{ sessionId: conversation.sessionId }]
							: []),
					],
				},
			});

			await tx.agentConversation.delete({ where: { id } });
		});

		this.logger.log({ message: "Conversation removed", conversationId: id });

		return { id };
	}

	private async withLiveNode(
		input: ConversationSaveInput,
	): Promise<ConversationSaveInput> {
		if (!input.campaignNodeId) return input;

		const node = await this.db.marketingCampaignNode.findFirst({
			where: { id: input.campaignNodeId, campaignId: input.campaignId },
			select: { id: true },
		});

		if (node) return input;

		this.logger.debug({
			message: "Conversation saved without a step that no longer exists",
			campaignId: input.campaignId,
		});

		return { ...input, campaignNodeId: undefined };
	}

	private recordId(input: RecordScope): string {
		const recordIds = recordScopeIds(input).filter(
			(recordId): recordId is string => Boolean(recordId),
		);
		const [recordId] = recordIds;

		if (!recordId || recordIds.length !== 1) {
			throw new BadRequestException(
				"Choose exactly one contact, company, deal, campaign, segment, template or shell.",
			);
		}

		return recordId;
	}

	private builderMessage(input: {
		message: string;
		resources: BuilderConversationCreateInput["resources"];
		attachments:
			| BuilderConversationCreateInput["attachments"]
			| BuilderConversationSubmitInput["attachments"];
	}): Prisma.InputJsonValue {
		return {
			text: input.message,
			resources: input.resources,
			attachments: input.attachments.map(({ name, type, size }) => ({
				name,
				type,
				size,
			})),
		};
	}

	private attachmentWrites(
		attachments: BuilderConversationCreateInput["attachments"],
	) {
		return attachments.map((attachment, position) => ({
			name: attachment.name,
			mediaType: attachment.type,
			size: attachment.size,
			content: Buffer.from(attachment.contentBase64, "base64"),
			position,
		}));
	}

	private async submissionAttachmentWrites(
		input: BuilderConversationSubmitInput,
		userId: string,
	) {
		const referencedIds = input.attachments.flatMap((attachment) =>
			"contentBase64" in attachment ? [] : [attachment.id],
		);
		const referenced =
			referencedIds.length > 0
				? await this.db.agentConversationAttachment.findMany({
						where: {
							id: { in: referencedIds },
							submission: {
								conversation: { id: input.id, userId, kind: "BUILDER" },
							},
						},
						select: {
							id: true,
							name: true,
							mediaType: true,
							size: true,
							content: true,
						},
					})
				: [];
		const referencedById = new Map(referenced.map((row) => [row.id, row]));

		if (referencedIds.some((id) => !referencedById.has(id))) {
			throw new BadRequestException(
				"One or more attachments are no longer available.",
			);
		}

		return input.attachments.map((attachment, position) => {
			if ("contentBase64" in attachment) {
				return {
					name: attachment.name,
					mediaType: attachment.type,
					size: attachment.size,
					content: Buffer.from(attachment.contentBase64, "base64"),
					position,
				};
			}

			const stored = referencedById.get(attachment.id);
			if (!stored) {
				throw new BadRequestException(
					"One or more attachments are no longer available.",
				);
			}
			return {
				name: stored.name,
				mediaType: stored.mediaType,
				size: stored.size,
				content: stored.content,
				position,
			};
		});
	}

	private async assertWorkspaceMember(userId: string): Promise<void> {
		const member = await this.db.member.findUnique({
			where: {
				organizationId_userId: { organizationId: WORKSPACE_ID, userId },
			},
			select: { id: true },
		});

		if (!member) {
			throw new NotFoundException("No workspace membership was found.");
		}
	}

	private requestByClientId(
		clientRequestId: string,
	): Promise<ExistingBuilderRequest | null> {
		return this.db.agentConversationSubmission.findUnique({
			where: { clientRequestId },
			select: {
				id: true,
				conversationId: true,
				submittedById: true,
				conversation: { select: { id: true, userId: true, kind: true } },
			},
		});
	}

	private replayBuilderCreation(
		existing: ExistingBuilderRequest,
		userId: string,
	): { id: string } {
		if (
			existing.conversation.userId !== userId ||
			existing.conversation.kind !== "BUILDER"
		) {
			throw new BadRequestException("That request has already been used.");
		}

		return { id: existing.conversation.id };
	}

	private replayBuilderSubmission(
		existing: ExistingBuilderRequest,
		conversationId: string,
		userId: string,
	): { id: string } {
		if (
			existing.conversationId !== conversationId ||
			existing.submittedById !== userId
		) {
			throw new BadRequestException("That request has already been used.");
		}

		return { id: existing.id };
	}
}

function isUniqueConstraint(error: unknown): boolean {
	return (
		error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function arrayOf(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function pendingBuilderQuestionOf(value: unknown) {
	const request = recordOf(value);
	if (
		request.kind !== "question" ||
		typeof request.requestId !== "string" ||
		!request.requestId ||
		typeof request.prompt !== "string" ||
		!request.prompt
	) {
		return null;
	}

	const display = ["confirmation", "select", "text"].includes(
		String(request.display),
	)
		? (request.display as "confirmation" | "select" | "text")
		: undefined;
	const options = arrayOf(request.options).flatMap((value) => {
		const option = recordOf(value);
		if (
			typeof option.id !== "string" ||
			!option.id ||
			typeof option.label !== "string" ||
			!option.label
		) {
			return [];
		}
		const style = ["danger", "default", "primary"].includes(
			String(option.style),
		)
			? (option.style as "danger" | "default" | "primary")
			: undefined;

		return [
			{
				id: option.id,
				label: option.label,
				description:
					typeof option.description === "string"
						? option.description
						: undefined,
				style,
			},
		];
	});

	return {
		kind: "question" as const,
		requestId: request.requestId,
		prompt: request.prompt,
		display,
		options,
		allowFreeform:
			request.allowFreeform === true ||
			display === "text" ||
			options.length === 0,
	};
}
