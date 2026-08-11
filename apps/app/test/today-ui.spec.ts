import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { todayFocusHistory } from "../app/(app)/[slug]/today-search-params";
import { showTodayNavigation } from "../components/crm/quick-switcher-navigation";

const appRoot = resolve(import.meta.dir, "..");
const todayDesk = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/today-desk.tsx"),
	"utf8",
);
const todayPage = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/page.tsx"),
	"utf8",
);
const approvalSheet = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/approval-focus-sheet.tsx"),
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

test("Today registers stay in operator order with counts secondary", () => {
	const keys = [
		"doNext",
		"needsApproval",
		"waiting",
		"blockedOrFailed",
		"running",
		"incidents",
	];
	const positions = keys.map((key) => todayDesk.indexOf(`key: "${key}"`));

	expect(positions.every((position) => position >= 0)).toBe(true);
	for (let index = 1; index < positions.length; index += 1) {
		const previous = positions[index - 1];
		const current = positions[index];
		if (previous === undefined || current === undefined) throw new Error();
		expect(current).toBeGreaterThan(previous);
	}
	expect(todayDesk).toContain("section.total");
	expect(todayDesk).toContain("section.rows.map");
});

test("Today routes Work rows and approval rows through URL focus", () => {
	expect(todayDesk).toContain('data-today-row-kind="work"');
	expect(todayDesk).toContain(`/work?work=\${encodeURIComponent(row.id)}`);
	expect(todayDesk).toContain('data-today-row-kind="approval"');
	expect(todayDesk).toContain('useQueryState("approval", parseAsString)');
	expect(todayDesk).toContain("todayFocusHistory(true)");
	expect(todayDesk).toContain("todayFocusHistory(false)");
	expect(todayPage).toContain("trpc.today.get.queryOptions({ limit: 25 })");
	expect(todayPage).toContain(
		"trpc.approval.detail.queryOptions({ id: approval })",
	);
});

test("approval actions remain server-capability and integrity gated", () => {
	expect(approvalSheet).toContain("approval.viewer.canApprove");
	expect(approvalSheet).toContain("approval.viewer.canReject");
	expect(approvalSheet).toContain("approval.viewer.canInvalidate");
	expect(approvalSheet).toContain("!current?.integrityValid");
	expect(approvalSheet).toContain("expectedVersion: current.version");
	expect(approvalSheet).toContain("contentDigest: current.contentDigest");
	expect(approvalSheet).toContain(
		"invalidationVersion: current.invalidationVersion",
	);
	expect(approvalSheet).toContain("clientRequestId: crypto.randomUUID()");
	expect(approvalSheet).toContain('aria-live="polite"');
	expect(approvalSheet).toContain('aria-live="assertive"');
});

test("Today navigation is named consistently and history semantics are explicit", () => {
	expect(todayFocusHistory(true)).toBe("push");
	expect(todayFocusHistory(false)).toBe("replace");
	expect(showTodayNavigation("")).toBe(true);
	expect(showTodayNavigation("tod")).toBe(true);
	expect(showTodayNavigation("work")).toBe(false);
	expect(rail).toContain('title: "Today"');
	expect(rail).toContain('href: "/"');
	expect(quickSwitcher).toContain('value="today"');
	expect(quickSwitcher).toContain('router.push(workspaceUrl("/"))');
});
