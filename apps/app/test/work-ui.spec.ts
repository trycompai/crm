import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dir, "..");
const workTable = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/work/work-table.tsx"),
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
	for (const facet of [
		"state",
		"queue",
		"owner",
		"due",
		"urgency",
		"subjectType",
	]) {
		expect(workParams).toContain(`"${facet}"`);
	}
	expect(workTable).toContain('useQueryState("work", parseAsString)');
	expect(workTable).toContain('setFocusId(null, { history: "replace" })');
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
});
