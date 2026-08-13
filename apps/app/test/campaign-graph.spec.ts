import { describe, expect, test } from "bun:test";
import {
	type GraphEdge,
	type GraphNode,
	graphErrors,
	validateGraph,
} from "@crm/db/marketing";
import {
	type CampaignGraph,
	GRAPH_NODE_ID,
	type NewKind,
	withNode,
	withoutNode,
} from "@/lib/campaign-graph";

function node(
	id: string,
	kind: CampaignGraph["nodes"][number]["kind"],
): CampaignGraph["nodes"][number] {
	return {
		id,
		kind,
		label: kind === "EMAIL" ? "Touch" : null,
		templateId: null,
		subject: kind === "EMAIL" ? "Hello" : null,
		preheader: null,
		document: kind === "EMAIL" ? { version: 1, blocks: [] } : null,
		delayHours: kind === "WAIT" ? 48 : null,
		condition: null,
		x: 0,
		y: 0,
	};
}

function graph(): CampaignGraph {
	return { nodes: [node("a", "EMAIL")], edges: [] };
}

function problemsFor(campaign: CampaignGraph, kind: NewKind, after: string) {
	const next = withNode(campaign, kind, after);

	return validateGraph(
		next.nodes as unknown as GraphNode[],
		next.edges as unknown as GraphEdge[],
		{ openTracking: true },
	);
}

describe("adding a step from the canvas", () => {
	test("an email lands after the anchor and the graph still runs", () => {
		const next = withNode(graph(), "EMAIL", "a");

		expect(next.nodes).toHaveLength(2);
		expect(next.edges).toHaveLength(1);
		expect(next.edges[0]?.fromId).toBe("a");
		expect(graphErrors(problemsFor(graph(), "EMAIL", "a"))).toEqual([]);
	});

	test("a wait and an exit both pass the validator", () => {
		expect(graphErrors(problemsFor(graph(), "WAIT", "a"))).toEqual([]);
		expect(graphErrors(problemsFor(graph(), "EXIT", "a"))).toEqual([]);
	});

	test("a branch arrives with a condition and both arms", () => {
		const next = withNode(graph(), "BRANCH", "a");
		const branch = next.nodes.find((row) => row.kind === "BRANCH");

		expect(branch?.condition).toEqual({
			facet: { facet: "mailbox.neverReplied" },
		});

		const handles = next.edges
			.filter((edge) => edge.fromId === branch?.id)
			.map((edge) => edge.handle)
			.sort();

		expect(handles).toEqual(["no", "yes"]);
		expect(graphErrors(problemsFor(graph(), "BRANCH", "a"))).toEqual([]);
	});

	test("a branch inserted mid-chain keeps the rest on the yes arm", () => {
		const chain: CampaignGraph = {
			nodes: [node("a", "EMAIL"), node("b", "EMAIL")],
			edges: [
				{ fromId: "a", toId: "b", handle: "next", label: null, weight: 100 },
			],
		};

		const next = withNode(chain, "BRANCH", "a");
		const branch = next.nodes.find((row) => row.kind === "BRANCH");
		const toB = next.edges.find((edge) => edge.toId === "b");

		expect(toB?.fromId).toBe(branch?.id);
		expect(toB?.handle).toBe("yes");
		expect(
			graphErrors(
				validateGraph(
					next.nodes as unknown as GraphNode[],
					next.edges as unknown as GraphEdge[],
					{ openTracking: true },
				),
			),
		).toEqual([]);
	});

	test("with nothing selected it appends to the end of the chain", () => {
		const chain: CampaignGraph = {
			nodes: [node("a", "EMAIL"), node("b", "EMAIL")],
			edges: [
				{ fromId: "a", toId: "b", handle: "next", label: null, weight: 100 },
			],
		};

		const next = withNode(chain, "EXIT", null);
		const added = next.nodes.find((row) => row.kind === "EXIT");

		expect(next.edges.find((edge) => edge.toId === added?.id)?.fromId).toBe(
			"b",
		);
	});

	test("a new node carries an id the eve proxy accepts", () => {
		const next = withNode(graph(), "EMAIL", "a");
		const added = next.nodes.find((row) => row.id !== "a");

		expect(GRAPH_NODE_ID.test(added?.id ?? "")).toBe(true);
	});

	test("an exit replaces the exit at the end instead of pointing at it", () => {
		const ending: CampaignGraph = {
			nodes: [node("a", "EMAIL"), node("b", "EMAIL"), node("x", "EXIT")],
			edges: [
				{ fromId: "a", toId: "b", handle: "next", label: null, weight: 100 },
				{ fromId: "b", toId: "x", handle: "next", label: null, weight: 100 },
			],
		};

		const next = withNode(ending, "EXIT", null);
		const added = next.nodes.find((row) => row.kind === "EXIT");

		expect(next.nodes.some((row) => row.id === "x")).toBe(false);
		expect(next.edges.find((edge) => edge.toId === added?.id)?.fromId).toBe(
			"b",
		);
		expect(errorsIn(next)).toEqual([]);
	});

	test("an exit after an email that already ends replaces that ending", () => {
		const ending: CampaignGraph = {
			nodes: [node("a", "EMAIL"), node("x", "EXIT")],
			edges: [
				{ fromId: "a", toId: "x", handle: "next", label: null, weight: 100 },
			],
		};

		const next = withNode(ending, "EXIT", "a");

		expect(next.nodes.some((row) => row.id === "x")).toBe(false);
		expect(errorsIn(next)).toEqual([]);
	});
});

function chain(): CampaignGraph {
	return {
		nodes: [node("a", "EMAIL"), node("w", "WAIT"), node("b", "EMAIL")],
		edges: [
			{ fromId: "a", toId: "w", handle: "next", label: null, weight: 100 },
			{ fromId: "w", toId: "b", handle: "next", label: null, weight: 100 },
		],
	};
}

function branching(): CampaignGraph {
	return {
		nodes: [
			node("a", "EMAIL"),
			node("br", "BRANCH"),
			node("yes", "EMAIL"),
			node("no", "EXIT"),
		],
		edges: [
			{ fromId: "a", toId: "br", handle: "next", label: null, weight: 100 },
			{ fromId: "br", toId: "yes", handle: "yes", label: null, weight: 100 },
			{ fromId: "br", toId: "no", handle: "no", label: null, weight: 100 },
		],
	};
}

function errorsIn(next: { nodes: unknown[]; edges: unknown[] }) {
	return graphErrors(
		validateGraph(next.nodes as GraphNode[], next.edges as GraphEdge[], {
			openTracking: true,
		}),
	);
}

describe("deleting a step from the canvas", () => {
	test("stitches the neighbours together and still runs", () => {
		const next = withoutNode(chain(), "w");
		if (!next) throw new Error("the wait should be removable");

		expect(next.nodes.map((one) => one.id)).toEqual(["a", "b"]);
		expect(next.edges).toHaveLength(1);
		expect(next.edges[0]).toMatchObject({ fromId: "a", toId: "b" });
		expect(next.orphaned).toBe(0);
		expect(errorsIn(next)).toEqual([]);
	});

	test("the last node cannot go, because a campaign with none cannot save", () => {
		expect(withoutNode({ nodes: [node("a", "EMAIL")], edges: [] }, "a")).toBe(
			null,
		);
	});

	test("deleting the first step leaves one root", () => {
		const next = withoutNode(chain(), "a");
		if (!next) throw new Error("the first email should be removable");

		expect(next.nodes.map((one) => one.id)).toEqual(["w", "b"]);
		expect(errorsIn(next)).toEqual([]);
	});

	test("deleting a branch takes the arms nothing else reaches, and says how many", () => {
		const next = withoutNode(branching(), "br");
		if (!next) throw new Error("the branch should be removable");

		expect(next.nodes.map((one) => one.id)).toEqual(["a"]);
		expect(next.orphaned).toBe(2);
		expect(errorsIn(next)).toEqual([]);
	});

	test("deleting one arm leaves the branch and the other arm", () => {
		const next = withoutNode(branching(), "yes");
		if (!next) throw new Error("the arm should be removable");

		expect(next.nodes.map((one) => one.id)).toEqual(["a", "br", "no"]);
		expect(next.orphaned).toBe(0);
	});
});
