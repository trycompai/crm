import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowCanvas } from "../src/components/flow-canvas";

describe("FlowCanvas", () => {
	test("holds the graph back until its box is measured", () => {
		const html = renderToStaticMarkup(<FlowCanvas nodes={[]} edges={[]} />);

		expect(html).toContain("crm-flow");
		expect(html).not.toContain("react-flow");
	});

	test("keeps the surface able to shrink to nothing", () => {
		const html = renderToStaticMarkup(<FlowCanvas nodes={[]} edges={[]} />);

		expect(html).toContain("min-w-0");
		expect(html).toContain("flex-1");
	});
});
