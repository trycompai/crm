export type NodeKind = "EMAIL" | "WAIT" | "BRANCH" | "SPLIT" | "EXIT";

export type CampaignGraph = {
	nodes: {
		id: string;
		kind: NodeKind;
		label: string | null;
		templateId: string | null;
		subject: string | null;
		preheader: string | null;
		document: Record<string, unknown> | null;
		delayHours: number | null;
		condition: Record<string, unknown> | null;
		x: number;
		y: number;
	}[];
	edges: {
		fromId: string;
		toId: string;
		handle: string;
		label: string | null;
		weight: number;
	}[];
};

export const ENTRY = {
	id: "__entry",
	width: 320,
	gapY: 92,
	nodeWidth: {
		EMAIL: 264,
		WAIT: 140,
		BRANCH: 224,
		SPLIT: 224,
		EXIT: 140,
	},
} as const;

export function entryLabel(
	segment: string | null,
	hasEntryRule = false,
): string {
	if (segment) return `Anyone in ${segment} starts here`;
	if (hasEntryRule) return "Anyone matching this campaign's rule starts here";
	return "Nobody starts here yet — click to choose who";
}

export function entryDetail(input: {
	automatic: boolean;
	chosen: boolean;
	held: number;
	hasExitRule: boolean;
}): string {
	const entry = !input.chosen
		? null
		: input.automatic
			? "Enters automatically"
			: "Added manually";

	const held =
		input.held > 0
			? `${input.held} segment${input.held === 1 ? "" : "s"} excluded`
			: null;

	const exit = input.hasExitRule ? "leaves on a rule" : "leaves at the end";

	return [entry, held, exit].filter(Boolean).join(" · ");
}

export function entryX(root: { kind: NodeKind; x: number }): number {
	return root.x + ENTRY.nodeWidth[root.kind] / 2 - ENTRY.width / 2;
}

export type NewKind = "EMAIL" | "WAIT" | "BRANCH" | "EXIT";

export const NEW_LABEL: Record<NewKind, string> = {
	EMAIL: "Email",
	WAIT: "Wait",
	BRANCH: "Branch",
	EXIT: "Exit",
};

const NEW_NODE: Record<NewKind, Record<string, unknown>> = {
	EMAIL: {
		kind: "EMAIL",
		label: "New touch",
		subject: "Untitled email",
		document: { version: 1, blocks: [] },
	},
	WAIT: { kind: "WAIT", label: "Wait", delayHours: 72 },
	BRANCH: {
		kind: "BRANCH",
		label: "Have they replied?",
		condition: { facet: { facet: "mailbox.neverReplied" } },
	},
	EXIT: { kind: "EXIT", label: "Stop here" },
};

const APPEND_KINDS = new Set<NodeKind>(["EMAIL", "WAIT"]);

export const GRAPH_NODE_ID = /^node_[a-z0-9]{1,32}$/;

function newId(): string {
	return `node_${Math.random().toString(36).slice(2, 12)}`;
}

type PlainNode = CampaignGraph["nodes"][number];
type PlainEdge = CampaignGraph["edges"][number];

function reachable(from: string[], edges: PlainEdge[]): Set<string> {
	const seen = new Set<string>();
	const queue = [...from];

	while (queue.length > 0) {
		const id = queue.pop();
		if (!id || seen.has(id)) continue;
		seen.add(id);

		for (const edge of edges) {
			if (edge.fromId === id) queue.push(edge.toId);
		}
	}

	return seen;
}

export type Removal = {
	nodes: PlainNode[];
	edges: PlainEdge[];
	orphaned: number;
};

export function withoutNode(
	campaign: CampaignGraph,
	nodeId: string,
): Removal | null {
	if (campaign.nodes.length <= 1) return null;

	const incoming = campaign.edges.filter((edge) => edge.toId === nodeId);
	const outgoing = campaign.edges.filter((edge) => edge.fromId === nodeId);

	const kept = campaign.edges
		.filter((edge) => edge.fromId !== nodeId && edge.toId !== nodeId)
		.map((edge) => ({ ...edge }));

	const onward = outgoing.find((edge) => edge.handle === "next") ?? outgoing[0];

	if (onward && outgoing.length === 1) {
		for (const edge of incoming) {
			kept.push({
				fromId: edge.fromId,
				toId: onward.toId,
				handle: edge.handle,
				label: edge.label,
				weight: edge.weight,
			});
		}
	}

	const left = campaign.nodes
		.filter((node) => node.id !== nodeId)
		.map((node) => ({ ...node }));

	if (left.length === 0) return null;

	const targeted = new Set(campaign.edges.map((edge) => edge.toId));

	const roots = campaign.nodes
		.filter((node) => !targeted.has(node.id) && node.id !== nodeId)
		.map((node) => node.id);

	const start = roots.length > 0 ? roots : outgoing.map((edge) => edge.toId);

	const alive = reachable(start, kept);
	const nodes = left.filter((node) => alive.has(node.id));

	if (nodes.length === 0) return null;

	const ids = new Set(nodes.map((node) => node.id));
	const edges = kept.filter(
		(edge) => ids.has(edge.fromId) && ids.has(edge.toId),
	);

	return { nodes, edges, orphaned: left.length - nodes.length };
}

function exitAnchor(
	campaign: CampaignGraph,
	chosen: PlainNode | null,
): PlainNode | null {
	if (!chosen || chosen.kind === "EXIT") return chosen;

	const handle = chosen.kind === "BRANCH" ? "yes" : "next";
	const following = campaign.edges.find(
		(edge) => edge.fromId === chosen.id && edge.handle === handle,
	);
	if (!following) return chosen;

	const next = campaign.nodes.find((node) => node.id === following.toId);
	return next?.kind === "EXIT" ? next : chosen;
}

export function withNode(
	campaign: CampaignGraph,
	kind: NewKind,
	afterId: string | null,
) {
	const nodes = campaign.nodes.map((node) => ({
		id: node.id,
		kind: node.kind,
		label: node.label,
		templateId: node.templateId,
		subject: node.subject,
		preheader: node.preheader,
		document: node.document,
		delayHours: node.delayHours,
		condition: node.condition,
		x: node.x,
		y: node.y,
	}));

	const edges = campaign.edges.map((edge) => ({
		fromId: edge.fromId,
		toId: edge.toId,
		handle: edge.handle,
		label: edge.label,
		weight: edge.weight,
	}));

	const outgoing = new Set(edges.map((edge) => edge.fromId));
	const chosen =
		(afterId
			? campaign.nodes.find((node) => node.id === afterId)
			: undefined) ??
		campaign.nodes.findLast(
			(node) => APPEND_KINDS.has(node.kind) && !outgoing.has(node.id),
		) ??
		campaign.nodes.findLast((node) => APPEND_KINDS.has(node.kind)) ??
		campaign.nodes[campaign.nodes.length - 1] ??
		null;

	const anchor = kind === "EXIT" ? exitAnchor(campaign, chosen) : chosen;

	const id = newId();
	nodes.push({ id, ...NEW_NODE[kind] } as (typeof nodes)[number]);

	if (!anchor) return { nodes, edges };

	const replacing = anchor.kind === "EXIT";
	const handle = anchor.kind === "BRANCH" ? "yes" : "next";

	if (replacing) {
		for (const edge of edges) {
			if (edge.toId === anchor.id) edge.toId = id;
		}
	}

	const following = replacing
		? undefined
		: edges.find((edge) => edge.fromId === anchor.id && edge.handle === handle);

	if (kind === "BRANCH") {
		const stop = newId();
		nodes.push({ id: stop, ...NEW_NODE.EXIT } as (typeof nodes)[number]);

		if (following) {
			following.fromId = id;
			following.handle = "yes";
		} else {
			const yes = newId();
			nodes.push({ id: yes, ...NEW_NODE.EXIT } as (typeof nodes)[number]);
			edges.push({
				fromId: id,
				toId: yes,
				handle: "yes",
				label: null,
				weight: 100,
			});
		}

		edges.push({
			fromId: id,
			toId: stop,
			handle: "no",
			label: null,
			weight: 100,
		});
	} else if (following) {
		following.fromId = id;
		following.handle = "next";
	}

	if (!replacing) {
		edges.push({
			fromId: anchor.id,
			toId: id,
			handle,
			label: null,
			weight: 100,
		});

		return { nodes, edges };
	}

	return {
		nodes: nodes.filter((node) => node.id !== anchor.id),
		edges: edges.filter((edge) => edge.fromId !== anchor.id),
	};
}
