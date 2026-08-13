import { type Db, Prisma } from "@crm/db";
import {
	assertSendable,
	autoLayout,
	campaignAudienceWhere,
	campaignSegments,
	enrolContact,
	type GraphEdge,
	type GraphNode,
	graphErrors,
	MARKETING,
	materialise,
	PAUSE_SKIP_REASONS,
	queueDirect,
	readMarketingSettings,
	setCampaignSegments,
	validateGraph,
} from "@crm/db/marketing";
import { documentProblems, EMPTY_DOCUMENT, lintEmail } from "@crm/email";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { blankToNull } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import {
	countsByKey,
	type ListInput,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import { MarketingTemplatesService } from "./marketing-templates.service";
import { ResendService } from "./resend.service";

type Json = Record<string, unknown> | null;

const MANUAL_EXIT_REASON = "a rep removed them";

const STUCK_AFTER_MS = MARKETING.enrolment.stuckAfterMs;

const LIVE_ONLY: Prisma.MarketingCampaignWhereInput = {
	status: { not: "ARCHIVED" },
};

const CAMPAIGN_STATUS_FILTERS: Record<
	string,
	Prisma.MarketingCampaignWhereInput
> = {
	"": LIVE_ONLY,
	all: LIVE_ONLY,
	DRAFT: { status: "DRAFT" },
	PENDING_APPROVAL: { status: "PENDING_APPROVAL" },
	SCHEDULED: { status: "SCHEDULED" },
	ACTIVE: { status: "ACTIVE" },
	PAUSED: { status: "PAUSED" },
	SENT: { status: { in: ["SENT", "SENDING"] } },
	DRAINING: { status: "DRAINING" },
	CANCELLED: { status: "CANCELLED" },
	FAILED: { status: "FAILED" },
	ARCHIVED: { status: "ARCHIVED" },
};

const RECIPIENT_FILTERS: Record<string, Prisma.MarketingSendWhereInput> = {
	all: {},
	opened: { openedAt: { not: null } },
	clicked: { clickedAt: { not: null } },
	replied: { repliedAt: { not: null } },
	bounced: { status: { in: ["BOUNCED", "COMPLAINED", "FAILED"] } },
	unsubscribed: { recipient: { status: "UNSUBSCRIBED" } },
	skipped: { status: "SKIPPED" },
};

function enrolmentFilter(
	state: string,
): Prisma.MarketingEnrolmentWhereInput | undefined {
	if (state === "active") return { status: "ACTIVE" };
	if (state === "exited") return { status: "EXITED" };

	if (state === "stuck") {
		return {
			status: "ACTIVE",
			nextDueAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) },
		};
	}

	return undefined;
}

function linkedSegments(input: {
	segmentIds?: string[];
	excludeSegmentIds?: string[];
}): { segmentId: string; mode: "INCLUDE" | "EXCLUDE" }[] {
	const chosen = new Map<string, "INCLUDE" | "EXCLUDE">();

	for (const segmentId of input.segmentIds ?? []) {
		chosen.set(segmentId, "INCLUDE");
	}

	for (const segmentId of input.excludeSegmentIds ?? []) {
		chosen.set(segmentId, "EXCLUDE");
	}

	return [...chosen].map(([segmentId, mode]) => ({ segmentId, mode }));
}

export type NodeStats = {
	nodeId: string;
	sent: number;
	delivered: number;
	opened: number;
	clicked: number;
	replied: number;
	bounced: number;
	unsubscribed: number;
	waiting: number;
};

@Injectable()
export class MarketingCampaignsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly resend: ResendService,
		private readonly templates: MarketingTemplatesService,
	) {}

	async list(input: ListInput & { kind?: string; status?: string }) {
		const where: Prisma.MarketingCampaignWhereInput = {
			...(CAMPAIGN_STATUS_FILTERS[input.status ?? ""] ?? LIVE_ONLY),
			...(input.q && {
				OR: [
					{ name: { contains: input.q, mode: "insensitive" } },
					{
						nodes: {
							some: { subject: { contains: input.q, mode: "insensitive" } },
						},
					},
				],
			}),
			...(input.kind === "BLAST" || input.kind === "DRIP"
				? { kind: input.kind }
				: {}),
		};

		const orderBy =
			resolveOrderBy<Prisma.MarketingCampaignOrderByWithRelationInput>(
				input,
				{
					name: (dir) => ({ name: dir }),
					updatedAt: (dir) => ({ updatedAt: dir }),
				},
				{ updatedAt: "desc" },
			);

		const [rows, total] = await Promise.all([
			this.db.marketingCampaign.findMany({
				where,
				orderBy,
				...paginate(input),
				select: {
					id: true,
					name: true,
					kind: true,
					status: true,
					scheduledAt: true,
					activatedAt: true,
					updatedAt: true,
					segments: {
						where: { mode: "INCLUDE" },
						select: { segment: { select: { name: true } } },
						orderBy: { addedAt: "asc" },
					},
					_count: { select: { nodes: true } },
				},
			}),
			this.db.marketingCampaign.count({ where }),
		]);

		const ids = rows.map((row) => row.id);

		const [kinds, sent, opened, clicked, replied] = await Promise.all([
			this.db.marketingCampaign.groupBy({
				by: ["kind"],
				where,
				_count: { _all: true },
			}),
			this.countByCampaign(ids, { status: { in: ["SENT", "DELIVERED"] } }),
			this.countByCampaign(ids, { openedAt: { not: null } }),
			this.countByCampaign(ids, { clickedAt: { not: null } }),
			this.countByCampaign(ids, { repliedAt: { not: null } }),
		]);

		const byId = new Map(
			ids.map((id) => [
				id,
				{
					sent: sent.get(id) ?? 0,
					opened: opened.get(id) ?? 0,
					clicked: clicked.get(id) ?? 0,
					replied: replied.get(id) ?? 0,
				},
			]),
		);

		return {
			rows: rows.map((row) => {
				const numbers = byId.get(row.id);
				const touches = row._count.nodes;

				return {
					id: row.id,
					name: row.name,
					kind: row.kind,
					status: row.status,
					touches,
					subtitle:
						row.kind === "DRIP"
							? `Sequence · ${touches} step${touches === 1 ? "" : "s"}`
							: "Blast",
					segment:
						row.segments.map((link) => link.segment.name).join(", ") || null,
					sent: numbers?.sent ?? 0,
					opened: numbers?.opened ?? 0,
					clicked: numbers?.clicked ?? 0,
					replied: numbers?.replied ?? 0,
					scheduledAt: row.scheduledAt,
					activatedAt: row.activatedAt,
					updatedAt: row.updatedAt,
				};
			}),
			total,
			facetCounts: { kind: countsByKey(kinds, "kind") },
		};
	}

	private async countByCampaign(
		ids: string[],
		filter: Prisma.MarketingSendWhereInput,
	): Promise<Map<string, number>> {
		if (ids.length === 0) return new Map();

		const groups = await this.db.marketingSend.groupBy({
			by: ["campaignId"],
			where: { campaignId: { in: ids }, ...filter },
			_count: { _all: true },
		});

		return new Map(
			groups.flatMap((group) =>
				group.campaignId
					? [[group.campaignId, group._count._all] as const]
					: [],
			),
		);
	}

	async overview() {
		const since = new Date(Date.now() - MARKETING.overview.windowMs);

		const [settings, live, recent, health, enrolments, unsubscribed] =
			await Promise.all([
				assertSendable(this.db),
				this.db.marketingCampaign.count({
					where: { status: { in: ["ACTIVE", "SENDING"] } },
				}),
				this.db.marketingCampaign.findMany({
					where: { status: { not: "ARCHIVED" } },
					select: {
						id: true,
						name: true,
						kind: true,
						status: true,
						updatedAt: true,
					},
					orderBy: { updatedAt: "desc" },
					take: 5,
				}),
				this.db.marketingSend.groupBy({
					by: ["status"],
					where: { sentAt: { gte: since } },
					_count: { _all: true },
				}),
				this.db.marketingEnrolment.count({ where: { status: "ACTIVE" } }),
				this.db.marketingEvent.count({
					where: { type: "UNSUBSCRIBED", at: { gte: since } },
				}),
			]);

		const count = (status: string) =>
			health.find((row) => row.status === status)?._count._all ?? 0;

		const sent =
			count("SENT") +
			count("DELIVERED") +
			count("BOUNCED") +
			count("COMPLAINED");

		return {
			sendable: settings.ok,
			missing: settings.ok ? [] : settings.missing,
			live,
			inFlight: enrolments,
			recent,
			thirtyDays: {
				sent,
				delivered: count("DELIVERED"),
				bounced: count("BOUNCED"),
				complained: count("COMPLAINED"),
				unsubscribed,
				bounceRate: sent > 0 ? count("BOUNCED") / sent : 0,
			},
		};
	}

	async byId(id: string) {
		const campaign = await this.db.marketingCampaign.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				kind: true,
				status: true,
				entryMode: true,
				entryDefinition: true,
				exitDefinition: true,
				reentryCooldownDays: true,
				maxPasses: true,
				fromName: true,
				fromAddress: true,
				replyTo: true,
				scheduledAt: true,
				activatedAt: true,
				pausedReason: true,
				createdById: true,
				createdAt: true,
				updatedAt: true,
				nodes: {
					select: {
						id: true,
						kind: true,
						label: true,
						templateId: true,
						subject: true,
						preheader: true,
						document: true,
						delayHours: true,
						condition: true,
						x: true,
						y: true,
					},
				},
				edges: {
					select: {
						id: true,
						fromId: true,
						toId: true,
						handle: true,
						label: true,
						weight: true,
					},
				},
			},
		});

		if (!campaign) throw new NotFoundException("No such campaign.");

		const [stats, health, enrolled, inFlight, audience, segments] =
			await Promise.all([
				this.nodeStats(id),
				this.health(id),
				this.db.marketingEnrolment.count({ where: { campaignId: id } }),
				this.db.marketingEnrolment.count({
					where: { campaignId: id, status: "ACTIVE" },
				}),
				this.audience(id),
				campaignSegments(this.db, id),
			]);

		return {
			...campaign,
			segments,
			entryDefinition: campaign.entryDefinition as Json,
			exitDefinition: campaign.exitDefinition as Json,
			nodes: campaign.nodes.map((node) => ({
				...node,
				document: node.document as Json,
				condition: node.condition as Json,
			})),
			stats,
			health,
			enrolled,
			inFlight,
			audience,
		};
	}

	async previewNode(input: {
		nodeId: string;
		subject?: string | null;
		preheader?: string | null;
		document?: unknown;
	}) {
		const node = await this.db.marketingCampaignNode.findUnique({
			where: { id: input.nodeId },
			select: { subject: true, preheader: true, document: true },
		});

		if (!node) throw new NotFoundException("No such node.");

		return this.templates.preview({
			document: input.document ?? node.document,
			subject: input.subject ?? node.subject,
			preheader: input.preheader ?? node.preheader,
			contactId: null,
		});
	}

	async sendTest(input: {
		nodeId: string;
		subject?: string | null;
		preheader?: string | null;
		document?: unknown;
		userId: string;
	}) {
		const sendable = await assertSendable(this.db);
		if (!sendable.ok) throw new BadRequestException(sendable.reason);

		const node = await this.db.marketingCampaignNode.findUnique({
			where: { id: input.nodeId },
			select: { subject: true, preheader: true, document: true },
		});

		if (!node) throw new NotFoundException("No such node.");

		const user = await this.db.user.findUnique({
			where: { id: input.userId },
			select: { email: true },
		});

		if (!user?.email) {
			throw new BadRequestException("Your account has no email address.");
		}

		const document = input.document ?? node.document ?? EMPTY_DOCUMENT;
		const subject = input.subject ?? node.subject ?? "";

		const problems = documentProblems(document);
		if (problems.length > 0) {
			throw new BadRequestException(
				`This email cannot be rendered. ${problems[0]?.message ?? ""}`.trim(),
			);
		}

		const result = await queueDirect(this.db, {
			address: user.email,
			subject: `[test] ${subject || "No subject yet"}`,
			document,
			origin: "TEST",
			requestedById: input.userId,
			preheader: input.preheader ?? node.preheader,
		});

		if (!result.ok) {
			throw new BadRequestException(
				result.reason === "unsubscribed"
					? "Your own address is unsubscribed, so nothing can go to it. Resubscribe it first."
					: `The test was refused: ${result.reason}.`,
			);
		}

		return { to: user.email };
	}

	private async audience(
		campaignId: string,
	): Promise<{ total: number; sendable: number; excluded: number }> {
		const where = await campaignAudienceWhere(this.db, campaignId);
		if (!where) return { total: 0, sendable: 0, excluded: 0 };

		const [total, sendable] = await Promise.all([
			this.db.contact.count({ where }),
			this.db.contact.count({
				where: {
					AND: [
						where,
						{ email: { not: null } },
						{
							OR: [
								{ marketingRecipients: { none: {} } },
								{ marketingRecipients: { some: { status: "SUBSCRIBED" } } },
							],
						},
					],
				},
			}),
		]);

		return { total, sendable, excluded: total - sendable };
	}

	async nodeStats(campaignId: string): Promise<NodeStats[]> {
		const nodes = await this.db.marketingCampaignNode.findMany({
			where: { campaignId },
			select: { id: true },
		});

		return Promise.all(
			nodes.map(async (node) => {
				const [
					sent,
					delivered,
					opened,
					clicked,
					replied,
					bounced,
					unsubscribed,
					waiting,
				] = await Promise.all([
					this.db.marketingSend.count({
						where: {
							nodeId: node.id,
							status: { in: ["SENT", "DELIVERED", "BOUNCED", "COMPLAINED"] },
						},
					}),
					this.db.marketingSend.count({
						where: { nodeId: node.id, status: "DELIVERED" },
					}),
					this.db.marketingSend.count({
						where: { nodeId: node.id, openedAt: { not: null } },
					}),
					this.db.marketingSend.count({
						where: { nodeId: node.id, clickedAt: { not: null } },
					}),
					this.db.marketingSend.count({
						where: { nodeId: node.id, repliedAt: { not: null } },
					}),
					this.db.marketingSend.count({
						where: { nodeId: node.id, status: "BOUNCED" },
					}),
					this.db.marketingEvent.count({
						where: { type: "UNSUBSCRIBED", send: { nodeId: node.id } },
					}),
					this.db.marketingEnrolment.count({
						where: { currentNodeId: node.id, status: "ACTIVE" },
					}),
				]);

				return {
					nodeId: node.id,
					sent,
					delivered,
					opened,
					clicked,
					replied,
					bounced,
					unsubscribed,
					waiting,
				};
			}),
		);
	}

	async health(campaignId: string) {
		const [sent, delivered, bounced, complained] = await Promise.all([
			this.db.marketingSend.count({
				where: {
					campaignId,
					status: { in: ["SENT", "DELIVERED", "BOUNCED", "COMPLAINED"] },
				},
			}),
			this.db.marketingSend.count({
				where: { campaignId, status: "DELIVERED" },
			}),
			this.db.marketingSend.count({ where: { campaignId, status: "BOUNCED" } }),
			this.db.marketingSend.count({
				where: { campaignId, status: "COMPLAINED" },
			}),
		]);

		return {
			sent,
			delivered,
			bounced,
			complained,
			bounceRate: sent > 0 ? bounced / sent : 0,
			complaintRate: sent > 0 ? complained / sent : 0,
			deliveredRate: sent > 0 ? delivered / sent : 0,
		};
	}

	async create(input: {
		name: string;
		kind: "BLAST" | "DRIP";
		segmentIds?: string[];
		excludeSegmentIds?: string[];
		userId: string;
	}) {
		const name = blankToNull(input.name);
		if (!name) throw new BadRequestException("Give the campaign a name.");

		return this.db.$transaction(async (tx) => {
			const campaign = await tx.marketingCampaign.create({
				data: {
					name,
					kind: input.kind,
					segments: { create: linkedSegments(input) },
					createdById: input.userId,
					entryMode: input.kind === "DRIP" ? "CONTINUOUS" : "MANUAL",
				},
				select: { id: true },
			});

			await tx.marketingCampaignNode.create({
				data: {
					campaignId: campaign.id,
					kind: "EMAIL",
					label: input.kind === "DRIP" ? "Touch 1" : "The email",
					subject: "",
					document: EMPTY_DOCUMENT as unknown as Prisma.InputJsonValue,
					x: 0,
					y: 0,
				},
			});

			return campaign;
		});
	}

	async duplicate(id: string, userId: string) {
		const source = await this.db.marketingCampaign.findUnique({
			where: { id },
			select: {
				name: true,
				kind: true,
				entryMode: true,
				entryDefinition: true,
				exitDefinition: true,
				reentryCooldownDays: true,
				maxPasses: true,
				fromName: true,
				fromAddress: true,
				replyTo: true,
				segments: { select: { segmentId: true, mode: true } },
				nodes: {
					select: {
						id: true,
						kind: true,
						label: true,
						templateId: true,
						subject: true,
						preheader: true,
						document: true,
						delayHours: true,
						condition: true,
						x: true,
						y: true,
					},
				},
				edges: {
					select: {
						fromId: true,
						toId: true,
						handle: true,
						label: true,
						weight: true,
					},
				},
			},
		});

		if (!source) throw new NotFoundException("No such campaign.");

		return this.db.$transaction(async (tx) => {
			const copy = await tx.marketingCampaign.create({
				data: {
					name: `${source.name} copy`,
					kind: source.kind,
					status: "DRAFT",
					entryMode: source.entryMode,
					entryDefinition:
						source.entryDefinition === null
							? Prisma.DbNull
							: (source.entryDefinition as Prisma.InputJsonValue),
					exitDefinition:
						source.exitDefinition === null
							? Prisma.DbNull
							: (source.exitDefinition as Prisma.InputJsonValue),
					reentryCooldownDays: source.reentryCooldownDays,
					maxPasses: source.maxPasses,
					fromName: source.fromName,
					fromAddress: source.fromAddress,
					replyTo: source.replyTo,
					createdById: userId,
					segments: { create: source.segments },
				},
				select: { id: true },
			});

			const made = new Map<string, string>();

			for (const node of source.nodes) {
				const row = await tx.marketingCampaignNode.create({
					data: {
						campaignId: copy.id,
						kind: node.kind,
						label: node.label,
						templateId: node.templateId,
						subject: node.subject,
						preheader: node.preheader,
						document:
							node.document === null
								? Prisma.DbNull
								: (node.document as Prisma.InputJsonValue),
						delayHours: node.delayHours,
						condition:
							node.condition === null
								? Prisma.DbNull
								: (node.condition as Prisma.InputJsonValue),
						x: node.x,
						y: node.y,
					},
					select: { id: true },
				});

				made.set(node.id, row.id);
			}

			const edges = source.edges.flatMap((edge) => {
				const fromId = made.get(edge.fromId);
				const toId = made.get(edge.toId);
				if (!fromId || !toId) return [];

				return [
					{
						campaignId: copy.id,
						fromId,
						toId,
						handle: edge.handle,
						label: edge.label,
						weight: edge.weight,
					},
				];
			});

			if (edges.length > 0) {
				await tx.marketingCampaignEdge.createMany({ data: edges });
			}

			return copy;
		});
	}

	async saveNodeAsTemplate(nodeId: string) {
		const node = await this.db.marketingCampaignNode.findUnique({
			where: { id: nodeId },
			select: {
				label: true,
				subject: true,
				preheader: true,
				document: true,
				campaign: { select: { name: true } },
			},
		});

		if (!node) throw new NotFoundException("No such node.");
		if (!node.document) {
			throw new BadRequestException("This email has no body to save.");
		}

		return this.templates.create({
			name: `${node.campaign.name} — ${node.label ?? "Email"}`,
			subject: node.subject ?? "",
			preheader: node.preheader,
			document: node.document,
		});
	}

	async update(input: {
		id: string;
		name?: string;
		segmentIds?: string[];
		excludeSegmentIds?: string[];
		fromName?: string | null;
		replyTo?: string | null;
		entryMode?: "MANUAL" | "CONTINUOUS";
		entryDefinition?: unknown;
		exitDefinition?: unknown;
		reentryCooldownDays?: number | null;
		maxPasses?: number;
		scheduledAt?: Date | null;
	}) {
		if (
			input.segmentIds !== undefined ||
			input.excludeSegmentIds !== undefined
		) {
			await setCampaignSegments(this.db, input.id, linkedSegments(input));
		}

		return this.db.marketingCampaign.update({
			where: { id: input.id },
			data: {
				...(input.name && { name: input.name }),
				...(input.fromName !== undefined && {
					fromName: blankToNull(input.fromName ?? ""),
				}),
				...(input.replyTo !== undefined && {
					replyTo: blankToNull(input.replyTo ?? ""),
				}),
				...(input.entryMode !== undefined && { entryMode: input.entryMode }),
				...(input.entryDefinition !== undefined && {
					entryDefinition:
						input.entryDefinition === null
							? Prisma.DbNull
							: (input.entryDefinition as Prisma.InputJsonValue),
				}),
				...(input.exitDefinition !== undefined && {
					exitDefinition:
						input.exitDefinition === null
							? Prisma.DbNull
							: (input.exitDefinition as Prisma.InputJsonValue),
				}),
				...(input.reentryCooldownDays !== undefined && {
					reentryCooldownDays: input.reentryCooldownDays,
				}),
				...(input.maxPasses !== undefined && { maxPasses: input.maxPasses }),
				...(input.scheduledAt !== undefined && {
					scheduledAt: input.scheduledAt,
				}),
			},
			select: { id: true },
		});
	}

	async writeGraph(input: {
		campaignId: string;
		nodes: GraphNode[];
		edges: GraphEdge[];
	}) {
		const settings = await readMarketingSettings(this.db);
		const domain = settings.resendDomainId
			? await this.resend.readDomain(settings.resendDomainId)
			: null;

		const problems = validateGraph(input.nodes, input.edges, {
			openTracking: domain?.openTracking ?? false,
		});

		if (graphErrors(problems).length > 0) {
			return { ok: false as const, problems };
		}

		const positions = autoLayout(input.nodes, input.edges);

		await this.db.$transaction(async (tx) => {
			const stray = await tx.marketingCampaignNode.findMany({
				where: {
					id: { in: input.nodes.map((node) => node.id) },
					campaignId: { not: input.campaignId },
				},
				select: { id: true },
			});

			if (stray.length > 0) {
				throw new ConflictException(
					`${stray.length} of these nodes belong to another campaign. Reload the graph and save it again.`,
				);
			}

			const existing = await tx.marketingCampaignNode.findMany({
				where: { campaignId: input.campaignId },
				select: { id: true, x: true, y: true },
			});
			const placed = new Map(existing.map((node) => [node.id, node]));
			const keep = new Set(input.nodes.map((node) => node.id));

			const busy = await tx.marketingEnrolment.findMany({
				where: {
					campaignId: input.campaignId,
					status: { in: ["ACTIVE", "PAUSED"] },
					currentNodeId: {
						in: existing.filter((node) => !keep.has(node.id)).map((n) => n.id),
					},
				},
				select: { currentNodeId: true },
			});

			if (busy.length > 0) {
				throw new ConflictException(
					`${busy.length} people are standing on a node you are deleting. Move them or let the campaign drain first.`,
				);
			}

			await tx.marketingCampaignEdge.deleteMany({
				where: { campaignId: input.campaignId },
			});
			await tx.marketingCampaignNode.deleteMany({
				where: { campaignId: input.campaignId, id: { notIn: [...keep] } },
			});

			for (const node of input.nodes) {
				const auto = positions.get(node.id) ?? { x: 0, y: 0 };
				const previous = placed.get(node.id);
				const x = node.x ?? previous?.x ?? auto.x;
				const y = node.y ?? previous?.y ?? auto.y;

				const data = {
					kind: node.kind,
					label: node.label ?? null,
					templateId: node.templateId ?? null,
					subject: node.subject ?? null,
					preheader: node.preheader ?? null,
					document: (node.document ?? undefined) as
						| Prisma.InputJsonValue
						| undefined,
					delayHours: node.delayHours ?? null,
					condition: (node.condition ?? undefined) as
						| Prisma.InputJsonValue
						| undefined,
					x,
					y,
				};

				await tx.marketingCampaignNode.upsert({
					where: { id: node.id },
					create: { id: node.id, campaignId: input.campaignId, ...data },
					update: data,
				});
			}

			for (const edge of input.edges) {
				await tx.marketingCampaignEdge.create({
					data: {
						campaignId: input.campaignId,
						fromId: edge.fromId,
						toId: edge.toId,
						handle: edge.handle ?? "next",
						label: edge.label ?? null,
						weight: edge.weight ?? 100,
					},
				});
			}
		});

		return {
			ok: true as const,
			problems: problems.filter((problem) => problem.level === "warning"),
			changed: input.nodes.map((node) => node.id),
		};
	}

	async updateNode(input: {
		nodeId: string;
		label?: string | null;
		subject?: string | null;
		preheader?: string | null;
		document?: unknown;
		delayHours?: number | null;
		condition?: unknown;
		x?: number;
		y?: number;
	}) {
		const node = await this.db.marketingCampaignNode.update({
			where: { id: input.nodeId },
			data: {
				...(input.label !== undefined && { label: input.label }),
				...(input.subject !== undefined && { subject: input.subject }),
				...(input.preheader !== undefined && { preheader: input.preheader }),
				...(input.document !== undefined && {
					document: input.document as Prisma.InputJsonValue,
				}),
				...(input.delayHours !== undefined && { delayHours: input.delayHours }),
				...(input.condition !== undefined && {
					condition: (input.condition ?? undefined) as Prisma.InputJsonValue,
				}),
				...(input.x !== undefined && { x: input.x }),
				...(input.y !== undefined && { y: input.y }),
			},
			select: {
				id: true,
				campaignId: true,
				subject: true,
				preheader: true,
				document: true,
			},
		});

		return {
			id: node.id,
			campaignId: node.campaignId,
			changed: [node.id],
			lint: lintEmail({
				document: node.document,
				subject: node.subject,
				preheader: node.preheader,
			}),
		};
	}

	async schedule(input: { id: string; at: Date | null }) {
		const sendable = await assertSendable(this.db);
		if (!sendable.ok) throw new BadRequestException(sendable.reason);

		const campaign = await this.db.marketingCampaign.findUnique({
			where: { id: input.id },
			select: {
				kind: true,
				_count: { select: { segments: true } },
				nodes: { select: { subject: true, document: true, kind: true } },
			},
		});

		if (!campaign) throw new NotFoundException("No such campaign.");
		if (campaign.kind !== "BLAST") {
			throw new BadRequestException("A sequence is activated, not scheduled.");
		}
		if (campaign._count.segments === 0) {
			throw new BadRequestException("Choose who this goes to first.");
		}

		const node = campaign.nodes.find((candidate) => candidate.kind === "EMAIL");
		const findings = lintEmail({
			document: node?.document,
			subject: node?.subject,
			preheader: null,
		});
		const errors = findings.filter((finding) => finding.level === "error");

		if (errors.length > 0) {
			throw new BadRequestException(
				errors.map((error) => error.message).join(" "),
			);
		}

		const at = input.at ?? new Date();

		await this.db.marketingCampaign.update({
			where: { id: input.id },
			data: { status: "SCHEDULED", scheduledAt: at },
		});

		const result = await materialise(this.db, input.id, { dueAt: at });

		const moved = await this.db.marketingSend.updateMany({
			where: { campaignId: input.id, status: "QUEUED", dueAt: { not: at } },
			data: { dueAt: at },
		});

		return { scheduledAt: at, at: input.at, ...result, moved: moved.count };
	}

	async setKind(id: string, kind: "BLAST" | "DRIP") {
		const campaign = await this.db.marketingCampaign.findUnique({
			where: { id },
			select: {
				kind: true,
				status: true,
				nodes: { select: { kind: true } },
				_count: { select: { sends: true, enrolments: true } },
			},
		});

		if (!campaign) throw new NotFoundException("No such campaign.");
		if (campaign.kind === kind) return { kind };

		if (campaign.status !== "DRAFT") {
			throw new BadRequestException(
				"Only a draft can change between a blast and a sequence.",
			);
		}

		if (campaign._count.sends > 0 || campaign._count.enrolments > 0) {
			throw new BadRequestException(
				"People have already been queued or enrolled, so this cannot change shape.",
			);
		}

		if (kind === "BLAST" && campaign.nodes.length > 1) {
			throw new BadRequestException(
				"A blast is one email. Delete the extra steps first, or leave it a sequence.",
			);
		}

		if (kind === "BLAST" && campaign.nodes[0]?.kind !== "EMAIL") {
			throw new BadRequestException(
				"A blast is one email, and this campaign's only step is not an email. Make it an email first, or leave it a sequence.",
			);
		}

		await this.db.marketingCampaign.update({
			where: { id },
			data: {
				kind,
				entryMode: kind === "DRIP" ? "CONTINUOUS" : "MANUAL",
				scheduledAt: null,
			},
		});

		return { kind };
	}

	async pending() {
		const rows = await this.db.marketingCampaign.findMany({
			where: { status: "PENDING_APPROVAL" },
			orderBy: { updatedAt: "desc" },
			select: {
				id: true,
				name: true,
				kind: true,
				scheduledAt: true,
				pausedReason: true,
				updatedAt: true,
				segments: {
					where: { mode: "INCLUDE" },
					select: { segment: { select: { id: true, name: true } } },
					orderBy: { addedAt: "asc" },
				},
				_count: { select: { nodes: true } },
			},
		});

		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			kind: row.kind,
			at: row.scheduledAt,
			note: row.pausedReason,
			nodes: row._count.nodes,
			segment: row.segments[0]?.segment ?? null,
			stagedAt: row.updatedAt,
		}));
	}

	async approve(id: string) {
		const campaign = await this.db.marketingCampaign.findUnique({
			where: { id },
			select: { kind: true, status: true, scheduledAt: true },
		});

		if (!campaign) throw new NotFoundException("No such campaign.");

		if (campaign.status !== "PENDING_APPROVAL") {
			throw new BadRequestException(
				"Nothing is waiting on that campaign — it is not pending approval.",
			);
		}

		await this.db.marketingCampaign.update({
			where: { id },
			data: { status: "DRAFT", pausedReason: null },
		});

		return campaign.kind === "DRIP"
			? this.activate(id)
			: this.schedule({ id, at: campaign.scheduledAt });
	}

	async reject(id: string, reason?: string) {
		const campaign = await this.db.marketingCampaign.findUnique({
			where: { id },
			select: { status: true },
		});

		if (campaign?.status !== "PENDING_APPROVAL") {
			throw new BadRequestException(
				"Nothing is waiting on that campaign — it is not pending approval.",
			);
		}

		await this.db.marketingCampaign.update({
			where: { id },
			data: {
				status: "DRAFT",
				scheduledAt: null,
				pausedReason: reason ?? null,
			},
		});

		return { status: "DRAFT" };
	}

	async activate(id: string) {
		const sendable = await assertSendable(this.db);
		if (!sendable.ok) throw new BadRequestException(sendable.reason);

		const campaign = await this.db.marketingCampaign.findUnique({
			where: { id },
			select: {
				kind: true,
				entryMode: true,
				entryDefinition: true,
				_count: { select: { segments: true } },
				nodes: {
					select: {
						id: true,
						kind: true,
						subject: true,
						document: true,
						delayHours: true,
						condition: true,
						templateId: true,
					},
				},
				edges: {
					select: {
						id: true,
						fromId: true,
						toId: true,
						handle: true,
						weight: true,
					},
				},
			},
		});

		if (!campaign) throw new NotFoundException("No such campaign.");
		if (campaign.kind !== "DRIP") {
			throw new BadRequestException("A blast is scheduled, not activated.");
		}

		const hasAudience =
			campaign._count.segments > 0 || Boolean(campaign.entryDefinition);
		if (campaign.entryMode === "CONTINUOUS" && !hasAudience) {
			throw new BadRequestException(
				"Nobody enters this campaign. Click the top of the flow and choose a segment, or switch it to manual entry.",
			);
		}

		const settings = await readMarketingSettings(this.db);
		const domain = settings.resendDomainId
			? await this.resend.readDomain(settings.resendDomainId)
			: null;

		const problems = validateGraph(campaign.nodes, campaign.edges, {
			openTracking: domain?.openTracking ?? false,
		});

		const errors = graphErrors(problems);
		if (errors.length > 0) {
			throw new BadRequestException(
				errors.map((problem) => problem.message).join(" "),
			);
		}

		await this.db.marketingCampaign.update({
			where: { id },
			data: { status: "ACTIVE", activatedAt: new Date(), pausedReason: null },
		});

		return { status: "ACTIVE" };
	}

	async pause(id: string, reason?: string) {
		await this.db.$transaction(async (tx) => {
			await tx.marketingCampaign.update({
				where: { id },
				data: { status: "PAUSED", pausedReason: reason ?? null },
			});

			await tx.marketingSend.updateMany({
				where: { campaignId: id, status: "QUEUED" },
				data: { status: "SKIPPED", skipReason: PAUSE_SKIP_REASONS.byPerson },
			});
		});

		return { status: "PAUSED" };
	}

	async resume(id: string, clocks: "restart" | "backlog") {
		const campaign = await this.db.marketingCampaign.findUnique({
			where: { id },
			select: { kind: true },
		});

		if (!campaign) throw new NotFoundException("No such campaign.");

		const status = campaign.kind === "DRIP" ? "ACTIVE" : "SENDING";

		await this.db.$transaction(async (tx) => {
			const moved = await tx.marketingCampaign.updateMany({
				where: { id, status: "PAUSED" },
				data: { status, pausedReason: null },
			});

			if (moved.count === 0) {
				throw new ConflictException(
					"Only a paused campaign can resume. This one is not paused.",
				);
			}

			if (clocks === "restart") {
				await tx.marketingEnrolment.updateMany({
					where: {
						campaignId: id,
						status: "ACTIVE",
						nextDueAt: { lt: new Date() },
					},
					data: { nextDueAt: new Date() },
				});
			}

			await tx.marketingSend.updateMany({
				where: {
					campaignId: id,
					status: "SKIPPED",
					skipReason: {
						in: [PAUSE_SKIP_REASONS.byPerson, PAUSE_SKIP_REASONS.bySystem],
					},
					OR: [{ enrolmentId: null }, { enrolment: { status: "ACTIVE" } }],
				},
				data: {
					status: "QUEUED",
					skipReason: null,
					...(clocks === "restart" && { dueAt: new Date() }),
				},
			});
		});

		return { status };
	}

	async drain(id: string) {
		await this.db.marketingCampaign.update({
			where: { id },
			data: { status: "DRAINING" },
		});
		return { status: "DRAINING" };
	}

	async archive(id: string, mode: "refuse" | "drain" | "stop") {
		const active = await this.db.marketingEnrolment.count({
			where: { campaignId: id, status: "ACTIVE" },
		});

		if (active > 0 && mode === "refuse") {
			throw new ConflictException(
				`${active} people are still walking this campaign. Let them finish, or stop everybody now.`,
			);
		}

		if (active > 0 && mode === "drain") return this.drain(id);

		if (active > 0) {
			await this.db.marketingEnrolment.updateMany({
				where: { campaignId: id, status: "ACTIVE" },
				data: {
					status: "EXITED",
					exitKind: "ARCHIVED",
					exitReason: "the campaign was stopped",
					exitedAt: new Date(),
				},
			});

			await this.db.marketingSend.updateMany({
				where: { campaignId: id, status: "QUEUED" },
				data: { status: "SKIPPED", skipReason: "the campaign was stopped" },
			});
		}

		await this.db.marketingCampaign.update({
			where: { id },
			data: { status: "ARCHIVED", finishedAt: new Date() },
		});

		return { status: "ARCHIVED" };
	}

	async cancel(id: string) {
		await this.db.marketingSend.updateMany({
			where: { campaignId: id, status: "QUEUED" },
			data: { status: "SKIPPED", skipReason: "the campaign was cancelled" },
		});

		await this.db.marketingCampaign.update({
			where: { id },
			data: { status: "CANCELLED", finishedAt: new Date() },
		});

		return { status: "CANCELLED" };
	}

	async recipients(input: ListInput & { campaignId: string; state: string }) {
		const scoped: Prisma.MarketingSendWhereInput = {
			campaignId: input.campaignId,
			...(input.q && {
				OR: [
					{
						recipient: { address: { contains: input.q, mode: "insensitive" } },
					},
					{ subject: { contains: input.q, mode: "insensitive" } },
				],
			}),
		};

		const where: Prisma.MarketingSendWhereInput = {
			...scoped,
			...RECIPIENT_FILTERS[input.state],
		};

		const orderBy =
			resolveOrderBy<Prisma.MarketingSendOrderByWithRelationInput>(
				input,
				{
					sentAt: (dir) => ({ sentAt: { sort: dir, nulls: "last" } }),
				},
				{ createdAt: "desc" },
			);

		const [rows, total, counts] = await Promise.all([
			this.db.marketingSend.findMany({
				where,
				...paginate(input),
				orderBy,
				select: {
					id: true,
					status: true,
					skipReason: true,
					sentAt: true,
					openedAt: true,
					clickedAt: true,
					repliedAt: true,
					subject: true,
					contactId: true,
					recipient: { select: { address: true, status: true } },
					node: { select: { id: true, label: true } },
				},
			}),
			this.db.marketingSend.count({ where }),
			this.stateCounts(scoped),
		]);

		const people = await this.db.contact.findMany({
			where: {
				id: {
					in: rows
						.map((row) => row.contactId)
						.filter((id): id is string => id !== null),
				},
			},
			select: { id: true, firstName: true, lastName: true },
		});

		const names = new Map(
			people.map((person) => [
				person.id,
				[person.firstName, person.lastName].filter(Boolean).join(" ") || null,
			]),
		);

		return {
			rows: rows.map((row) => ({
				...row,
				name: row.contactId ? (names.get(row.contactId) ?? null) : null,
			})),
			total,
			facetCounts: { state: counts },
		};
	}

	private async stateCounts(
		scoped: Prisma.MarketingSendWhereInput,
	): Promise<Record<string, number>> {
		const states = Object.keys(RECIPIENT_FILTERS);

		const totals = await Promise.all(
			states.map((state) =>
				this.db.marketingSend.count({
					where: { ...scoped, ...RECIPIENT_FILTERS[state] },
				}),
			),
		);

		const counts: Record<string, number> = {};
		states.forEach((state, at) => {
			counts[state] = totals[at] ?? 0;
		});

		return counts;
	}

	async enrolments(input: ListInput & { campaignId: string; state: string }) {
		const where: Prisma.MarketingEnrolmentWhereInput = {
			campaignId: input.campaignId,
			...enrolmentFilter(input.state),
			...(input.q && {
				contact: {
					OR: [
						{ firstName: { contains: input.q, mode: "insensitive" } },
						{ lastName: { contains: input.q, mode: "insensitive" } },
						{ email: { contains: input.q, mode: "insensitive" } },
					],
				},
			}),
		};

		const orderBy =
			resolveOrderBy<Prisma.MarketingEnrolmentOrderByWithRelationInput>(
				input,
				{
					enrolledAt: (dir) => ({ enrolledAt: dir }),
				},
				{ enrolledAt: "desc" },
			);

		const [rows, total, nodes] = await Promise.all([
			this.db.marketingEnrolment.findMany({
				where,
				...paginate(input),
				orderBy,
				select: {
					id: true,
					status: true,
					pass: true,
					currentNodeId: true,
					nextDueAt: true,
					exitKind: true,
					exitReason: true,
					enrolledAt: true,
					contact: {
						select: { id: true, firstName: true, lastName: true, email: true },
					},
				},
			}),
			this.db.marketingEnrolment.count({ where }),
			this.db.marketingCampaignNode.findMany({
				where: { campaignId: input.campaignId },
				select: { id: true, label: true, kind: true },
			}),
		]);

		const labels = new Map(
			nodes.map((node) => [node.id, node.label ?? node.kind]),
		);

		const now = new Date();

		return {
			rows: rows.map((row) => ({
				...row,
				nodeLabel: row.currentNodeId
					? (labels.get(row.currentNodeId) ?? null)
					: null,
				stuck:
					row.status === "ACTIVE" &&
					row.nextDueAt !== null &&
					row.nextDueAt < new Date(now.getTime() - STUCK_AFTER_MS),
			})),
			total,
			facetCounts: {},
		};
	}

	private async recipientOf(contactId: string) {
		const select = {
			address: true,
			status: true,
			statusReason: true,
			statusAt: true,
		} as const;

		const owned = await this.db.marketingRecipient.findFirst({
			where: { contactId },
			select,
		});
		if (owned) return owned;

		const contact = await this.db.contact.findUnique({
			where: { id: contactId },
			select: { email: true },
		});
		if (!contact?.email) return null;

		return this.db.marketingRecipient.findUnique({
			where: { address: contact.email.toLowerCase() },
			select,
		});
	}

	async forContact(contactId: string) {
		const [recipient, enrolments, sends] = await Promise.all([
			this.recipientOf(contactId),
			this.db.marketingEnrolment.findMany({
				where: { contactId },
				orderBy: { enrolledAt: "desc" },
				take: 50,
				select: {
					id: true,
					status: true,
					pass: true,
					nextDueAt: true,
					exitReason: true,
					enrolledAt: true,
					currentNodeId: true,
					campaign: { select: { id: true, name: true, status: true } },
				},
			}),
			this.db.marketingSend.findMany({
				where: { contactId },
				orderBy: { createdAt: "desc" },
				take: 50,
				select: {
					id: true,
					subject: true,
					status: true,
					skipReason: true,
					sentAt: true,
					openedAt: true,
					clickedAt: true,
					repliedAt: true,
					campaign: { select: { id: true, name: true } },
				},
			}),
		]);

		const nodes = await this.db.marketingCampaignNode.findMany({
			where: {
				id: {
					in: enrolments
						.map((row) => row.currentNodeId)
						.filter((id): id is string => id !== null),
				},
			},
			select: { id: true, label: true, kind: true },
		});

		const labels = new Map(
			nodes.map((node) => [node.id, node.label ?? node.kind]),
		);

		const overdue = new Date(Date.now() - STUCK_AFTER_MS);

		return {
			recipient,
			enrolments: enrolments.map((row) => ({
				...row,
				nodeLabel: row.currentNodeId
					? (labels.get(row.currentNodeId) ?? null)
					: null,
				stuck:
					row.status === "ACTIVE" &&
					row.nextDueAt !== null &&
					row.nextDueAt < overdue,
			})),
			sends,
		};
	}

	async enrol(campaignId: string, contactId: string) {
		const result = await enrolContact(this.db, campaignId, contactId);
		if (!result.ok) throw new BadRequestException(result.reason);
		return result;
	}

	async unenrol(enrolmentId: string) {
		await this.db.$transaction(async (tx) => {
			await tx.marketingEnrolment.update({
				where: { id: enrolmentId },
				data: {
					status: "EXITED",
					exitKind: "MANUAL",
					exitReason: MANUAL_EXIT_REASON,
					exitedAt: new Date(),
				},
			});

			await tx.marketingSend.updateMany({
				where: { enrolmentId, status: "QUEUED" },
				data: { status: "SKIPPED", skipReason: MANUAL_EXIT_REASON },
			});
		});

		return { ok: true };
	}

	async declareWinner(input: { nodeId: string; winningEdgeId: string }) {
		const edges = await this.db.marketingCampaignEdge.findMany({
			where: { fromId: input.nodeId },
			select: { id: true },
		});

		if (!edges.some((edge) => edge.id === input.winningEdgeId)) {
			throw new BadRequestException("That path does not leave this split.");
		}

		const stillOnLoser = await this.db.marketingEnrolment.count({
			where: {
				status: "ACTIVE",
				currentNodeId: {
					in: edges
						.filter((e) => e.id !== input.winningEdgeId)
						.map((e) => e.id),
				},
			},
		});

		await this.db.$transaction(
			edges.map((edge) =>
				this.db.marketingCampaignEdge.update({
					where: { id: edge.id },
					data: { weight: edge.id === input.winningEdgeId ? 100 : 0 },
				}),
			),
		);

		return { ok: true, stillOnLoser };
	}

	async sendDirect(input: {
		contactId: string;
		templateId: string;
		userId: string;
		replyTo?: string | null;
	}) {
		const sendable = await assertSendable(this.db);
		if (!sendable.ok) throw new BadRequestException(sendable.reason);

		const [contact, template] = await Promise.all([
			this.db.contact.findUnique({
				where: { id: input.contactId },
				select: { email: true },
			}),
			this.db.marketingTemplate.findUnique({
				where: { id: input.templateId },
				select: { subject: true, document: true },
			}),
		]);

		if (!contact?.email)
			throw new BadRequestException("That contact has no email address.");
		if (!template) throw new NotFoundException("No such template.");

		const result = await queueDirect(this.db, {
			address: contact.email,
			contactId: input.contactId,
			subject: template.subject,
			document: template.document,
			replyTo: input.replyTo ?? null,
			requestedById: input.userId,
		});

		if (!result.ok) {
			throw new BadRequestException(
				result.reason === "unsubscribed"
					? "That person unsubscribed from marketing email, so nothing was sent."
					: `Nothing was sent: ${result.reason}.`,
			);
		}

		return result;
	}

	async sendCompany(input: {
		companyId: string;
		templateId: string;
		userId: string;
		replyTo?: string | null;
	}): Promise<{
		queued: number;
		skipped: Record<string, number>;
		total: number;
	}> {
		const sendable = await assertSendable(this.db);
		if (!sendable.ok) throw new BadRequestException(sendable.reason);

		const [contacts, template] = await Promise.all([
			this.db.contact.findMany({
				where: { companyId: input.companyId, email: { not: null } },
				select: { id: true, email: true },
			}),
			this.db.marketingTemplate.findUnique({
				where: { id: input.templateId },
				select: { subject: true, document: true },
			}),
		]);

		if (!template) throw new NotFoundException("No such template.");

		if (contacts.length === 0) {
			throw new BadRequestException(
				"Nobody at that company has an email address.",
			);
		}

		const skipped: Record<string, number> = {};
		let queued = 0;

		for (const contact of contacts) {
			const result = await queueDirect(this.db, {
				address: contact.email as string,
				contactId: contact.id,
				subject: template.subject,
				document: template.document,
				replyTo: input.replyTo ?? null,
				requestedById: input.userId,
			});

			if (result.ok) queued += 1;
			else skipped[result.reason] = (skipped[result.reason] ?? 0) + 1;
		}

		return { queued, skipped, total: contacts.length };
	}

	async enrolCompany(
		campaignId: string,
		companyId: string,
	): Promise<{ enrolled: number; refused: number; total: number }> {
		const contacts = await this.db.contact.findMany({
			where: { companyId, email: { not: null } },
			select: { id: true },
		});

		if (contacts.length === 0) {
			throw new BadRequestException(
				"Nobody at that company has an email address.",
			);
		}

		let enrolled = 0;
		let refused = 0;

		for (const contact of contacts) {
			const result = await enrolContact(this.db, campaignId, contact.id);
			if (result.ok) enrolled += 1;
			else refused += 1;
		}

		return { enrolled, refused, total: contacts.length };
	}
}
