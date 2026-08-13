import { describe, expect, test } from "bun:test";
import {
	autoLayout,
	type GraphEdge,
	type GraphNode,
	graphErrors,
	pickArm,
	rootNode,
	validateGraph,
} from "../src/marketing/graph";

const OPENED = {
	facet: { facet: "marketing.openedCampaign", campaignId: "camp_1" },
};

function email(id: string): GraphNode {
	return {
		id,
		kind: "EMAIL",
		subject: "Hello",
		document: { version: 1, blocks: [] },
	};
}

function edge(
	fromId: string,
	toId: string,
	handle = "next",
	weight = 100,
): GraphEdge {
	return { id: `${fromId}-${handle}`, fromId, toId, handle, weight };
}

describe("a graph that is fine", () => {
	test("passes with no problems", () => {
		const problems = validateGraph(
			[email("a"), { id: "w", kind: "WAIT", delayHours: 48 }, email("b")],
			[edge("a", "w"), edge("w", "b")],
			{ openTracking: true },
		);

		expect(problems).toEqual([]);
	});

	test("has one root, and it is the node nothing points at", () => {
		const nodes = [email("a"), email("b")];
		expect(rootNode(nodes, [edge("a", "b")])?.id).toBe("a");
	});
});

describe("an email that picks a template", () => {
	test("passes, because the executor resolves the template at the send", () => {
		const problems = validateGraph(
			[{ id: "a", kind: "EMAIL", templateId: "tpl_1" }],
			[],
			{ openTracking: true },
		);

		expect(graphErrors(problems)).toEqual([]);
	});
});

describe("a graph that loops", () => {
	test("is refused, because a campaign runs forwards only", () => {
		const problems = validateGraph(
			[email("a"), email("b")],
			[edge("a", "b"), edge("b", "a", "back")],
			{ openTracking: true },
		);

		expect(problems.some((problem) => problem.code === "cycle")).toBe(true);
	});

	test("names a second starting point rather than picking one", () => {
		const problems = validateGraph([email("a"), email("b")], [], {
			openTracking: true,
		});

		expect(problems.some((problem) => problem.code === "many-roots")).toBe(
			true,
		);
	});
});

describe("a branch", () => {
	test("needs both arms", () => {
		const problems = validateGraph(
			[{ id: "b", kind: "BRANCH", condition: OPENED }, email("y")],
			[edge("b", "y", "yes")],
			{ openTracking: true },
		);

		expect(
			problems.some((problem) => problem.code === "branch-missing-arm"),
		).toBe(true);
	});

	test("on opened with tracking off is an error, because that arm can never fire", () => {
		const problems = validateGraph(
			[{ id: "b", kind: "BRANCH", condition: OPENED }, email("y"), email("n")],
			[edge("b", "y", "yes"), edge("b", "n", "no")],
			{ openTracking: false },
		);

		const dead = problems.find(
			(problem) => problem.code === "branch-open-tracking-off",
		);

		expect(dead?.level).toBe("error");
		expect(dead?.nodeId).toBe("b");
	});

	test("on opened with tracking on warns about Apple, and still saves", () => {
		const problems = validateGraph(
			[{ id: "b", kind: "BRANCH", condition: OPENED }, email("y"), email("n")],
			[edge("b", "y", "yes"), edge("b", "n", "no")],
			{ openTracking: true },
		);

		expect(
			problems.find((problem) => problem.code === "branch-opens-are-inflated")
				?.level,
		).toBe("warning");
		expect(graphErrors(problems)).toEqual([]);
	});
});

describe("a split", () => {
	test("refuses arms that do not add up to a hundred", () => {
		const problems = validateGraph(
			[{ id: "s", kind: "SPLIT" }, email("a"), email("b")],
			[edge("s", "a", "a", 40), edge("s", "b", "b", 40)],
			{ openTracking: true },
		);

		expect(problems.some((problem) => problem.code === "split-weights")).toBe(
			true,
		);
	});

	test("sends the same enrolment down the same arm every time", () => {
		const arms = [
			{ id: "1", toId: "a", weight: 50 },
			{ id: "2", toId: "b", weight: 50 },
		];

		const first = pickArm(arms, "enrol_9:split_1");
		const again = pickArm(arms, "enrol_9:split_1");

		expect(first?.toId).toBe(again?.toId as string);
	});

	test("splits a population roughly by weight", () => {
		const arms = [
			{ id: "1", toId: "a", weight: 50 },
			{ id: "2", toId: "b", weight: 50 },
		];

		let a = 0;
		for (let index = 0; index < 400; index += 1) {
			if (pickArm(arms, `enrol_${index}:split_1`)?.toId === "a") a += 1;
		}

		expect(a).toBeGreaterThan(140);
		expect(a).toBeLessThan(260);
	});
});

describe("an exit", () => {
	test("leads nowhere", () => {
		const problems = validateGraph(
			[email("a"), { id: "x", kind: "EXIT" }, email("b")],
			[edge("a", "x"), edge("x", "b")],
			{ openTracking: true },
		);

		expect(problems.some((problem) => problem.code === "exit-has-out")).toBe(
			true,
		);
	});
});

describe("auto layout", () => {
	test("places every node, so the agent never has to invent coordinates", () => {
		const nodes = [email("a"), email("b"), email("c")];
		const positions = autoLayout(nodes, [edge("a", "b"), edge("a", "c")]);

		expect(positions.size).toBe(3);
		expect(positions.get("a")?.y).toBe(0);
		expect(positions.get("b")?.y).toBe(positions.get("c")?.y as number);
		expect(positions.get("b")?.x).not.toBe(positions.get("c")?.x as number);
	});
});
