import { describe, expect, test } from "bun:test";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	EmailNode,
	ExitNode,
	LogicNode,
	WaitNode,
} from "../src/components/flow-nodes";

const props = (data: Record<string, unknown>) =>
	({
		id: "n",
		data,
		selected: false,
		type: "x",
		dragging: false,
		zIndex: 0,
		isConnectable: false,
		positionAbsoluteX: 0,
		positionAbsoluteY: 0,
	}) as never;

function markup(element: unknown): string {
	return renderToStaticMarkup(
		<ReactFlowProvider>{element as ReactElement}</ReactFlowProvider>,
	);
}

function text(html: string): string {
	return html
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

describe("an email node", () => {
	const html = markup(
		EmailNode(
			props({
				label: "Touch 1 · A",
				subject: "Saw you were looking at pricing",
				stats: { sent: 604, opened: 308, clicked: 84, replied: 21 },
			}),
		),
	);

	test("shows the touch and its subject", () => {
		expect(text(html)).toContain("Touch 1 · A");
		expect(text(html)).toContain("Saw you were looking at pricing");
	});

	test("turns the counts into rates a marketer reads", () => {
		expect(text(html)).toContain("604 sent");
		expect(text(html)).toContain("51% open");
		expect(text(html)).toContain("14% click");
		expect(text(html)).toContain("3% reply");
	});

	test("says so rather than dividing by zero", () => {
		const empty = markup(
			EmailNode(
				props({
					label: "Touch 2",
					subject: "",
					stats: { sent: 0, opened: 0, clicked: 0, replied: 0 },
				}),
			),
		);

		expect(text(empty)).toContain("No subject yet");
		expect(text(empty)).toContain("Nothing sent yet");
		expect(text(empty)).not.toContain("open");
	});
});

describe("the other node kinds", () => {
	test("a wait names its delay", () => {
		expect(text(markup(WaitNode(props({ label: "Wait 2 days" }))))).toContain(
			"Wait 2 days",
		);
	});

	test("a branch names its condition", () => {
		const html = markup(
			LogicNode(props({ kind: "Branch", label: "Clicked touch 1?" })),
		);
		expect(text(html)).toContain("Branch");
		expect(text(html)).toContain("Clicked touch 1?");
	});

	test("a branch renders both arms as handles", () => {
		const html = markup(
			LogicNode(props({ kind: "Branch", label: "Opened touch 1?" })),
		);
		expect(html).toContain('data-handleid="yes"');
		expect(html).toContain('data-handleid="no"');
	});

	test("a split renders its two arms", () => {
		const html = markup(
			LogicNode(props({ kind: "A/B split", label: "Subject line · 50 / 50" })),
		);
		expect(html).toContain('data-handleid="a"');
		expect(html).toContain('data-handleid="b"');
	});

	test("an exit is the end, so it has no source handle", () => {
		const html = markup(ExitNode(props({ label: "Exit" })));
		expect(text(html)).toContain("Exit");
		expect(html).not.toContain('data-handlepos="bottom"');
	});
});
