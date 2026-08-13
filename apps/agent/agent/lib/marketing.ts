import { db, type MarketingCampaignStatus, type Prisma } from "@crm/db";
import {
	assertSendable,
	autoLayout,
	filterSchema,
	type GraphEdge,
	type GraphNode,
	graphErrors,
	queueDirect,
	readMarketingSettings,
	segmentWhere,
	validateGraph,
} from "@crm/db/marketing";
import { readWorkspaceIdentity } from "@crm/db/workspace";
import {
	BLOCK_SHAPES,
	documentProblems,
	readDocument,
} from "@crm/email/document";
import { type LintFinding, lintEmail } from "@crm/email/lint";

export const MARKETING_AGENT = {
	graph: {
		silentEditStatuses: ["DRAFT"] as readonly MarketingCampaignStatus[],
	},
} as const;

export type ToolProblem = {
	level: string;
	code: string;
	message: string;
	nodeId?: string;
};

type GraphRefusal = { error: string; problems: ToolProblem[] };

export async function listSegments(limit = 50) {
	const rows = await db.marketingSegment.findMany({
		where: { archivedAt: null },
		select: {
			id: true,
			name: true,
			description: true,
			definition: true,
			members: { select: { contactId: true, mode: true } },
		},
		orderBy: { updatedAt: "desc" },
		take: limit,
	});

	return {
		segments: await Promise.all(
			rows.map(async (row) => ({
				id: row.id,
				name: row.name,
				description: row.description,
				people: await db.contact.count({ where: segmentWhere(row) }),
			})),
		),
	};
}

export async function readSegment(id: string) {
	const row = await db.marketingSegment.findUnique({
		where: { id },
		select: {
			id: true,
			name: true,
			description: true,
			definition: true,
			members: { select: { contactId: true, mode: true } },
		},
	});

	if (!row) return { error: "No segment with that id." };

	return {
		id: row.id,
		name: row.name,
		description: row.description,
		definition: row.definition,
		people: await db.contact.count({ where: segmentWhere(row) }),
	};
}

export async function previewSegment(definition: unknown, limit = 20) {
	const parsed = filterSchema.safeParse(definition);

	if (!parsed.success) {
		return {
			error: "Those rules cannot be read.",
			problems: parsed.error.issues.map((issue) => issue.message),
		};
	}

	const where = segmentWhere({ definition: parsed.data });

	const [total, sample] = await Promise.all([
		db.contact.count({ where }),
		db.contact.findMany({
			where,
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				company: { select: { id: true, name: true } },
			},
			take: limit,
		}),
	]);

	return { total, sample };
}

export async function writeSegment(input: {
	id?: string;
	name: string;
	description?: string;
	definition: unknown;
}) {
	const parsed = filterSchema.safeParse(input.definition);

	if (!parsed.success) {
		return {
			error: "Those rules cannot be read. Fix them and call this again.",
			problems: parsed.error.issues.map(
				(issue) => `${issue.path.join(".")}: ${issue.message}`,
			),
		};
	}

	const data = {
		name: input.name,
		description: input.description ?? null,
		definition: parsed.data as object,
		kind: "DYNAMIC" as const,
	};

	const segment = input.id
		? await db.marketingSegment.update({
				where: { id: input.id },
				data,
				select: { id: true },
			})
		: await db.marketingSegment.create({ data, select: { id: true } });

	const people = await db.contact.count({
		where: segmentWhere({ definition: parsed.data }),
	});

	return { id: segment.id, people, changed: [segment.id] };
}

export async function listTemplates(limit = 50) {
	const rows = await db.marketingTemplate.findMany({
		where: { archivedAt: null },
		select: { id: true, name: true, subject: true },
		orderBy: { updatedAt: "desc" },
		take: limit,
	});

	return { templates: rows };
}

export async function readTemplate(id: string) {
	const row = await db.marketingTemplate.findUnique({
		where: { id },
		select: {
			id: true,
			name: true,
			subject: true,
			preheader: true,
			document: true,
		},
	});

	return row ?? { error: "No template with that id." };
}

export async function writeTemplate(input: {
	id?: string;
	name: string;
	subject: string;
	preheader?: string;
	document: unknown;
}) {
	const document = readDocument(input.document);

	if (!document) {
		return {
			error: "That email document cannot be read.",
			problems: documentProblems(input.document),
			shapes: BLOCK_SHAPES,
		};
	}

	const findings = lintEmail({
		document,
		subject: input.subject,
		preheader: input.preheader,
	});

	const errors = findings.filter(
		(finding: LintFinding) => finding.level === "error",
	);

	if (errors.length > 0) {
		return {
			error: "The linter refused this. Fix these and call again.",
			problems: errors,
		};
	}

	const data = {
		name: input.name,
		subject: input.subject,
		preheader: input.preheader ?? null,
		document: document as object,
	};

	const template = input.id
		? await db.marketingTemplate.update({
				where: { id: input.id },
				data,
				select: { id: true },
			})
		: await db.marketingTemplate.create({ data, select: { id: true } });

	return {
		id: template.id,
		warnings: findings.filter(
			(finding: LintFinding) => finding.level === "warning",
		),
		changed: [template.id],
	};
}

export async function readShell(id: string) {
	const shell = await db.marketingPartial.findUnique({
		where: { id },
		select: {
			id: true,
			kind: true,
			name: true,
			document: true,
			isDefault: true,
			_count: { select: { headerFor: true, footerFor: true } },
		},
	});

	if (!shell) return { error: "No header or footer with that id." };

	const settings = await readMarketingSettings(db);
	const workspace = await readWorkspaceIdentity(db).catch(() => null);

	return {
		id: shell.id,
		kind: shell.kind,
		name: shell.name,
		isDefault: shell.isDefault,
		usedBy: shell._count.headerFor + shell._count.footerFor,
		document: readDocument(shell.document),
		alreadyDrawn:
			shell.kind === "HEADER"
				? settings.logoUrl
					? `The compiler already draws the logo at the top: ${settings.logoUrl}. It is not a block and you cannot add, move or remove it. Anything in this document sits under it.`
					: `The compiler already draws "${workspace?.name ?? "the workspace name"}" in bold at the top. It is not a block. Anything in this document sits under it.`
				: "The compiler already adds the postal address and the unsubscribe link under this document. Neither is a block. Never write a second unsubscribe link.",
	};
}

export async function writeShell(input: {
	shellId: string;
	name?: string;
	document: unknown;
}) {
	const shell = await db.marketingPartial.findUnique({
		where: { id: input.shellId },
		select: { kind: true, isDefault: true, archivedAt: true },
	});

	if (!shell) return { error: "No header or footer with that id." };

	if (!shell.isDefault || shell.archivedAt) {
		const worn = await db.marketingPartial.findFirst({
			where: { kind: shell.kind, isDefault: true, archivedAt: null },
			select: { id: true },
		});

		const name = shell.kind === "HEADER" ? "header" : "footer";

		return {
			error: worn
				? `Outgoing email wears only the default ${name}, and this is not it. Writing it would change nothing anybody receives. Call this again with shellId ${worn.id}.`
				: `Outgoing email wears only the default ${name}, and this is not it. There is no default ${name} yet, so nothing can be rewritten.`,
		};
	}

	const document = readDocument(input.document);

	if (!document) {
		return {
			error: "That document cannot be read.",
			problems: documentProblems(input.document),
			shapes: BLOCK_SHAPES,
		};
	}

	const updated = await db.marketingPartial.update({
		where: { id: input.shellId },
		data: {
			...(input.name && { name: input.name }),
			document: document as object,
		},
		select: { id: true, kind: true, name: true },
	});

	return { ok: true, shell: updated };
}

export async function readCampaign(id: string) {
	const campaign = await db.marketingCampaign.findUnique({
		where: { id },
		select: {
			id: true,
			name: true,
			kind: true,
			status: true,
			entryMode: true,
			maxPasses: true,
			reentryCooldownDays: true,
			segments: {
				select: { mode: true, segment: { select: { id: true, name: true } } },
			},
			nodes: {
				select: {
					id: true,
					kind: true,
					label: true,
					subject: true,
					preheader: true,
					delayHours: true,
					condition: true,
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

	if (!campaign) return { error: "No campaign with that id." };

	const stats = await Promise.all(
		campaign.nodes.map(async (node) => {
			const [sent, opened, clicked, replied, waiting] = await Promise.all([
				db.marketingSend.count({
					where: { nodeId: node.id, status: { in: ["SENT", "DELIVERED"] } },
				}),
				db.marketingSend.count({
					where: { nodeId: node.id, openedAt: { not: null } },
				}),
				db.marketingSend.count({
					where: { nodeId: node.id, clickedAt: { not: null } },
				}),
				db.marketingSend.count({
					where: { nodeId: node.id, repliedAt: { not: null } },
				}),
				db.marketingEnrolment.count({
					where: { currentNodeId: node.id, status: "ACTIVE" },
				}),
			]);

			return { nodeId: node.id, sent, opened, clicked, replied, waiting };
		}),
	);

	return {
		...campaign,
		segments: campaign.segments.map((link) => ({
			id: link.segment.id,
			name: link.segment.name,
			mode: link.mode,
		})),
		stats,
	};
}

function nodeDocumentProblems(nodes: GraphNode[]): ToolProblem[] {
	const problems: ToolProblem[] = [];

	for (const node of nodes) {
		if (node.kind !== "EMAIL") continue;
		if (node.document === undefined || node.document === null) continue;

		const document = readDocument(node.document);

		if (!document) {
			for (const issue of documentProblems(node.document)) {
				problems.push({
					level: "error",
					code: "email-unreadable-document",
					nodeId: node.id,
					message: `${issue.path}: ${issue.message}`,
				});
			}
			continue;
		}

		if (document.blocks.length === 0) {
			problems.push({
				level: "error",
				code: "email-empty",
				nodeId: node.id,
				message: "This email has no blocks, so it would go out blank.",
			});
			continue;
		}

		for (const finding of lintEmail({
			document,
			subject: node.subject,
			preheader: node.preheader,
		})) {
			if (finding.level !== "error") continue;

			problems.push({
				level: finding.level,
				code: finding.code,
				message: finding.message,
				nodeId: node.id,
			});
		}
	}

	return problems;
}

export async function graphEditNeedsPerson(
	campaignId: string,
): Promise<boolean> {
	const campaign = await db.marketingCampaign.findUnique({
		where: { id: campaignId },
		select: { status: true },
	});

	if (!campaign) return false;

	return !MARKETING_AGENT.graph.silentEditStatuses.includes(campaign.status);
}

export async function writeCampaignGraph(input: {
	campaignId: string;
	nodes: GraphNode[];
	edges: GraphEdge[];
}) {
	const settings = await readMarketingSettings(db);

	const problems = validateGraph(input.nodes, input.edges, {
		openTracking: Boolean(settings.resendDomainId),
	});

	const errors = [
		...graphErrors(problems),
		...nodeDocumentProblems(input.nodes),
	];

	if (errors.length > 0) {
		return {
			error: "This graph will not run. Fix these and call again.",
			problems: errors,
			shapes: errors.some(
				(problem) => problem.code === "email-unreadable-document",
			)
				? BLOCK_SHAPES
				: undefined,
		};
	}

	const positions = autoLayout(input.nodes, input.edges);

	const refusal = await db.$transaction(
		async (tx): Promise<GraphRefusal | null> => {
			const keep = new Set(input.nodes.map((node) => node.id));

			const elsewhere = await tx.marketingCampaignNode.findMany({
				where: { id: { in: [...keep] }, campaignId: { not: input.campaignId } },
				select: { id: true },
			});

			if (elsewhere.length > 0) {
				return {
					error:
						"Some of those ids are nodes of another campaign. Read this campaign for its own ids, or send new ones.",
					problems: elsewhere.map((node) => ({
						level: "error",
						code: "node-other-campaign",
						nodeId: node.id,
						message: "This node belongs to another campaign.",
					})),
				};
			}

			const existing = await tx.marketingCampaignNode.findMany({
				where: { campaignId: input.campaignId },
				select: { id: true },
			});

			const removing = existing
				.filter((node) => !keep.has(node.id))
				.map((node) => node.id);

			const busy =
				removing.length === 0
					? []
					: await tx.marketingEnrolment.groupBy({
							by: ["currentNodeId"],
							where: {
								campaignId: input.campaignId,
								status: { in: ["ACTIVE", "PAUSED"] },
								currentNodeId: { in: removing },
							},
							_count: { _all: true },
						});

			if (busy.length > 0) {
				const people = busy.reduce((sum, row) => sum + row._count._all, 0);

				return {
					error: `${people} people stand on a node you are deleting. Keep those nodes, or let the campaign drain first.`,
					problems: busy.map((row) => ({
						level: "error",
						code: "node-has-people",
						nodeId: row.currentNodeId ?? undefined,
						message: `${row._count._all} people wait on this node.`,
					})),
				};
			}

			await tx.marketingCampaignEdge.deleteMany({
				where: { campaignId: input.campaignId },
			});
			await tx.marketingCampaignNode.deleteMany({
				where: { campaignId: input.campaignId, id: { notIn: [...keep] } },
			});

			for (const node of input.nodes) {
				const at = positions.get(node.id) ?? { x: 0, y: 0 };
				const data = {
					kind: node.kind,
					label: node.label ?? null,
					subject: node.subject ?? null,
					preheader: node.preheader ?? null,
					document: (node.document ?? undefined) as object | undefined,
					delayHours: node.delayHours ?? null,
					condition: (node.condition ?? undefined) as object | undefined,
					x: at.x,
					y: at.y,
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

			return null;
		},
	);

	if (refusal) return refusal;

	return {
		ok: true,
		warnings: problems.filter((problem) => problem.level === "warning"),
		changed: input.nodes.map((node) => node.id),
	};
}

export async function updateCampaignNode(input: {
	nodeId: string;
	label?: string;
	subject?: string;
	preheader?: string;
	document?: Record<string, unknown>;
	delayHours?: number;
	condition?: Record<string, unknown>;
}) {
	const node = await db.marketingCampaignNode.findUnique({
		where: { id: input.nodeId },
		select: { id: true, kind: true, campaign: { select: { status: true } } },
	});

	if (!node) return { error: "No node with that id." };

	if (input.condition !== undefined && node.kind !== "BRANCH") {
		return { error: "Only a BRANCH holds a condition." };
	}

	if (input.delayHours !== undefined && node.kind !== "WAIT") {
		return { error: "Only a WAIT holds a delay." };
	}

	const wantsCopy =
		input.subject !== undefined ||
		input.preheader !== undefined ||
		input.document !== undefined;

	if (wantsCopy && node.kind !== "EMAIL") {
		return { error: "Only an EMAIL holds a subject, a preheader or a body." };
	}

	const updated = await db.marketingCampaignNode.update({
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
				condition: input.condition as Prisma.InputJsonValue,
			}),
		},
		select: { id: true, kind: true, label: true },
	});

	return { ok: true, node: updated, live: node.campaign.status === "ACTIVE" };
}

export async function stageCampaign(input: {
	campaignId: string;
	at?: Date | null;
	note: string;
}) {
	const campaign = await db.marketingCampaign.findUnique({
		where: { id: input.campaignId },
		select: {
			kind: true,
			status: true,
			_count: { select: { nodes: true, segments: true } },
		},
	});

	if (!campaign) return { error: "No campaign with that id." };

	if (campaign.status !== "DRAFT" && campaign.status !== "PENDING_APPROVAL") {
		return {
			error: `That campaign is ${campaign.status}. Only a draft can be staged for approval.`,
		};
	}

	if (campaign._count.segments === 0) {
		return { error: "It has no segment, so nobody would receive it." };
	}

	if (campaign._count.nodes === 0) {
		return { error: "It has no nodes yet." };
	}

	await db.marketingCampaign.update({
		where: { id: input.campaignId },
		data: {
			status: "PENDING_APPROVAL",
			scheduledAt: input.at ?? null,
			pausedReason: input.note,
		},
	});

	return {
		ok: true,
		status: "PENDING_APPROVAL",
		waitingOn: "a person clicking Approve in Marketing",
	};
}

export async function sendDirectEmail(input: {
	contactId: string;
	templateId: string;
	requestedById?: string;
}) {
	const sendable = await assertSendable(db);

	if (!sendable.ok) {
		return { error: `${sendable.reason} Nothing was queued.` };
	}

	const [contact, template] = await Promise.all([
		db.contact.findUnique({
			where: { id: input.contactId },
			select: { email: true, firstName: true },
		}),
		db.marketingTemplate.findUnique({
			where: { id: input.templateId },
			select: { subject: true, document: true },
		}),
	]);

	if (!contact?.email) return { error: "That contact has no email address." };
	if (!template) return { error: "No template with that id." };

	const result = await queueDirect(db, {
		address: contact.email,
		contactId: input.contactId,
		subject: template.subject,
		document: template.document,
		requestedById: input.requestedById,
	});

	if (!result.ok) {
		return {
			error:
				result.reason === "unsubscribed"
					? `${contact.email} unsubscribed from marketing email, so nothing was sent.`
					: `Nothing was sent: ${result.reason}.`,
		};
	}

	await pokeDrain();

	return { sendId: result.sendId, to: contact.email };
}

export async function pokeDrain(): Promise<void> {
	const url = process.env.API_URL;
	const secret = process.env.AGENT_BRIDGE_SECRET;
	if (!url || !secret) return;

	try {
		await fetch(`${url.replace(/\/$/, "")}/internal/marketing/drain`, {
			method: "POST",
			headers: { authorization: `Bearer ${secret}` },
		});
	} catch {
		return;
	}
}
