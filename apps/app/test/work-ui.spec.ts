import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { showWorkNavigation } from "../components/crm/quick-switcher-navigation";
import {
	toWorkListInput,
	workAssigneeOptions,
	workFocusHistory,
} from "../lib/work-input";

const appRoot = resolve(import.meta.dir, "..");
const workTable = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/work/work-table.tsx"),
	"utf8",
);
const workPage = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/work/page.tsx"),
	"utf8",
);
const workParams = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/work/work-search-params.ts"),
	"utf8",
);
const detailSheet = readFileSync(
	resolve(appRoot, "components/detail-sheet.tsx"),
	"utf8",
);
const rail = readFileSync(
	resolve(appRoot, "components/app-icon-rail.tsx"),
	"utf8",
);
const quickSwitcher = readFileSync(
	resolve(appRoot, "components/crm/quick-switcher.tsx"),
	"utf8",
);

test("work URL state keeps list defaults and server facets", () => {
	expect(workParams).toContain('defaultSort: "updatedAt"');
	expect(workParams).toContain('defaultDir: "desc"');
	for (const facet of ["state", "queue", "assignee", "due", "subjectType"]) {
		expect(workParams).toContain(`"${facet}"`);
	}
	expect(workParams).not.toContain('"urgency"');
	expect(workPage).toContain(
		"toWorkListInput(workSearchParams.toInput(values))",
	);
	expect(workTable).toContain("toWorkListInput(rawInput)");
	expect(workTable).toContain('useQueryState("work", parseAsString)');
	expect(workTable).toContain("workFocusHistory(true)");
	expect(workTable).toContain("workFocusHistory(false)");
});

test("work assignee URL values map to one valid server owner filter", () => {
	const base = {
		q: "",
		sort: "updatedAt",
		dir: "desc",
		page: 1,
		pageSize: 25,
		state: "all",
		queue: "all",
		due: "all",
		subjectType: "all",
	};

	for (const { value, expected } of [
		{ value: "all", expected: "all" },
		{ value: "me", expected: "me" },
		{ value: "unassigned", expected: "unassigned" },
	] as const) {
		const mapped = toWorkListInput({ ...base, assignee: value });
		expect(mapped.owner).toBe(expected);
		expect(mapped).not.toHaveProperty("ownerId");
	}

	const mapped = toWorkListInput({ ...base, assignee: "user-123" });
	expect(mapped.owner).toBe("all");
	expect(mapped.ownerId).toBe("user-123");
	expect(toWorkListInput({ ...base, assignee: "user-123" })).toEqual(mapped);
});

test("assignee options keep My work visible and filter named owners by count", () => {
	const options = workAssigneeOptions(
		{ "user-1": 2, "user-2": 0, unassigned: 0 },
		[
			{ id: "user-1", name: "Richard" },
			{ id: "user-2", name: "Angus" },
		],
	);

	expect(options).toEqual([
		{ value: "me", label: "My work" },
		{ value: "unassigned", label: "Unassigned" },
		{ value: "user-1", label: "Richard" },
	]);
	expect(
		workAssigneeOptions(undefined, [{ id: "user-2", name: "Angus" }]),
	).toEqual([
		{ value: "me", label: "My work" },
		{ value: "unassigned", label: "Unassigned" },
	]);
});

test("inherited subject-type keys are rejected before the API input", () => {
	const base = {
		q: "",
		sort: "updatedAt",
		dir: "desc",
		page: 1,
		pageSize: 25,
		state: "all",
		queue: "all",
		assignee: "all",
		due: "all",
	};

	for (const subjectType of ["constructor", "toString"]) {
		expect(toWorkListInput({ ...base, subjectType })).not.toHaveProperty(
			"subjectType",
		);
	}
});

test("focus history pushes on open and replaces on close", () => {
	expect(workFocusHistory(true)).toBe("push");
	expect(workFocusHistory(false)).toBe("replace");
});

test("work actions remain fail-closed without server capabilities", () => {
	expect(workTable).toContain("server supplies an");
	expect(workTable).toContain("explicit capability for this item");
	expect(workTable).not.toContain("useMutation");
	expect(workTable).not.toContain("role ===");
	expect(workTable).not.toContain("state ===");
});

test("detail sheets preserve connected openers and allow default close focus otherwise", () => {
	expect(detailSheet).toContain(
		"restoreDetailSheetFocus(opener.current, event)",
	);
	expect(detailSheet).toContain("event?.preventDefault()");
	expect(detailSheet).toContain("if (!target?.isConnected) return false");
});

test("work focus and data states are labelled for assistive technology", () => {
	expect(workTable).toContain('label="Search work"');
	expect(workTable).toContain("loading={work.isFetching}");
	expect(workTable).toContain("Work could not be loaded. Try again.");
	expect(workTable).toContain('title="Loading work"');
});

test("work is present in primary and quick navigation", () => {
	expect(rail).toContain('title: "Work"');
	expect(rail).toContain('href: "/work"');
	expect(quickSwitcher).toContain('value="work"');
	expect(quickSwitcher).toContain('router.push(workspaceUrl("/work"))');
	expect(showWorkNavigation("")).toBe(true);
	expect(showWorkNavigation("wo")).toBe(true);
	expect(showWorkNavigation("work")).toBe(true);
	expect(showWorkNavigation("x")).toBe(false);
	expect(showWorkNavigation("work item")).toBe(false);
});
