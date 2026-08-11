import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	canRetryWorkAction,
	rememberWorkActionIntent,
	workActionDescriptors,
	workActionRetryState,
} from "../app/(app)/[slug]/work/work-action-descriptors";
import { resetWorkDialogState } from "../app/(app)/[slug]/work/work-dialog-state";
import { showWorkNavigation } from "../components/crm/quick-switcher-navigation";
import {
	workAssignInput,
	workMutationBase,
	workReasonInput,
	workWaitInput,
} from "../lib/work-action-inputs";
import {
	toWorkListInput,
	workAssigneeOptions,
	workAssigneeUsers,
	workAssignmentUsers,
	workFocusHistory,
	workspaceMemberLoadState,
	workspaceMemberPageInputs,
	workspaceMemberSearchInput,
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
const workActions = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/work/work-actions.tsx"),
	"utf8",
);

const noCapabilities = {
	canClaim: false,
	canAssign: false,
	canStart: false,
	canWait: false,
	canBlock: false,
	canComplete: false,
	canDismiss: false,
};

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
	expect(workPage).toContain("trpc.workspace.members.queryOptions");
	expect(workPage).not.toContain("trpc.users.list.queryOptions");
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
			{ userId: "user-1", name: "Richard" },
			{ userId: "user-2", name: "Angus" },
		],
	);

	expect(options).toEqual([
		{ value: "me", label: "My work" },
		{ value: "unassigned", label: "Unassigned" },
		{ value: "user-1", label: "Richard" },
	]);
	expect(
		workAssigneeOptions(undefined, [{ userId: "user-2", name: "Angus" }]),
	).toEqual([
		{ value: "me", label: "My work" },
		{ value: "unassigned", label: "Unassigned" },
	]);
});

test("workspace members map userId for facets and assignment", () => {
	const members = [
		{ userId: "user-1", name: "Richard" },
		{ userId: "user-2", name: "Angus" },
	];

	expect(workAssigneeUsers(members)).toEqual([
		{ id: "user-1", name: "Richard" },
		{ id: "user-2", name: "Angus" },
	]);
	const options = workAssigneeOptions(
		{ "user-2": 3, "removed-user": 2 },
		members,
	);
	expect(options).toContainEqual({ value: "user-2", label: "Angus" });
	expect(options).not.toContainEqual({
		value: "removed-user",
		label: "Removed user",
	});
});

test("empty assignment search keeps all unfiltered member options", () => {
	const allMembers = Array.from({ length: 101 }, (_, index) => ({
		id: `user-${index + 1}`,
		name: `Member ${index + 1}`,
	}));

	expect(workAssignmentUsers("", undefined, allMembers)).toHaveLength(101);
	expect(
		workAssignmentUsers(
			"angus",
			[{ id: "user-101", name: "Angus" }],
			allMembers,
		),
	).toEqual([{ id: "user-101", name: "Angus" }]);
	expect(workActions).toContain('assigneeSearch.trim() !== ""');
});

test("partial workspace member pages fail closed while loading or errored", () => {
	expect(
		workspaceMemberLoadState({ loading: false, error: false }, [
			{ loading: true, error: false },
		]),
	).toEqual({ loading: true, error: false, ready: false });
	expect(
		workspaceMemberLoadState({ loading: false, error: false }, [
			{ loading: false, error: true },
		]),
	).toEqual({ loading: false, error: true, ready: false });
	expect(workTable).toContain("memberLoadState.loading");
	expect(workTable).toContain(
		'role={memberLoadState.error ? "alert" : "status"}',
	);
	expect(workTable).toContain("retryMembers");
});

test("dialog reset clears cross-action fields and uses the refreshed owner", () => {
	expect(resetWorkDialogState("owner-before")).toEqual({
		reason: "",
		nextReviewAt: "",
		assigneeId: "owner-before",
		assigneeSearch: "",
	});
	expect(resetWorkDialogState("owner-after")).toEqual({
		reason: "",
		nextReviewAt: "",
		assigneeId: "owner-after",
		assigneeSearch: "",
	});
	expect(resetWorkDialogState(null).assigneeId).toBe("unassigned");
});

test("member search reaches a matching member beyond the initial page", () => {
	const initialPage = Array.from({ length: 100 }, (_, index) => ({
		userId: `user-${index + 1}`,
		name: `Member ${index + 1}`,
	}));
	const beyondInitialPage = {
		userId: "user-101",
		name: "Beyond Initial Page",
	};
	const searchInput = workspaceMemberSearchInput("Beyond Initial Page");

	expect(searchInput).toMatchObject({
		q: "Beyond Initial Page",
		page: 1,
		pageSize: 100,
	});
	expect(
		initialPage.some((member) => member.userId === beyondInitialPage.userId),
	).toBe(false);
	expect(workAssigneeUsers([beyondInitialPage])).toEqual([
		{ id: "user-101", name: "Beyond Initial Page" },
	]);
	expect(workActions).toContain('id="work-assignee-search"');
	expect(workActions).toContain("workspaceMemberSearchInput(assigneeSearch)");
});

test("workspace member page inputs cover every bounded member page", () => {
	expect(workspaceMemberPageInputs(101).map((input) => input.page)).toEqual([
		1, 2,
	]);
	expect(workspaceMemberPageInputs(250).map((input) => input.page)).toEqual([
		1, 2, 3,
	]);
	expect(
		workspaceMemberPageInputs(250).every((input) => input.pageSize === 100),
	).toBe(true);
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

test("work action descriptors are capability-driven", () => {
	expect(workActionDescriptors(noCapabilities)).toEqual([]);
	expect(
		workActionDescriptors({
			...noCapabilities,
			canClaim: true,
			canComplete: true,
		}),
	).toEqual([
		{ name: "claim", capability: "canClaim", label: "Claim" },
		{ name: "complete", capability: "canComplete", label: "Complete" },
	]);
	expect(workActionDescriptors({ ...noCapabilities, canAssign: true })).toEqual(
		[{ name: "assign", capability: "canAssign", label: "Assign" }],
	);
	expect(
		workActionDescriptors(
			{ ...noCapabilities, canAssign: true, canStart: true },
			false,
		),
	).toEqual([{ name: "start", capability: "canStart", label: "Start" }]);
});

test("work action inputs are exact and preserve an intent request key", () => {
	const base = workMutationBase("work-1", 4, "request-1");
	expect(base).toEqual({
		id: "work-1",
		expectedVersion: 4,
		clientRequestId: "request-1",
	});
	expect(workAssignInput(base, null)).toEqual({ ...base, assigneeId: null });
	expect(
		workWaitInput(base, "Need a reply", "2030-01-01T10:00:00.000Z"),
	).toEqual({
		...base,
		reason: "Need a reply",
		nextReviewAt: "2030-01-01T10:00:00.000Z",
	});
	expect(workReasonInput(base, "Not a fit")).toEqual({
		...base,
		reason: "Not a fit",
	});
});

test("known mutation conflicts do not offer blind retry, transport failures do", () => {
	const conflict = workActionRetryState("complete", "CONFLICT");
	const validation = workActionRetryState("complete", "BAD_REQUEST");
	const transport = workActionRetryState("complete", "INTERNAL_SERVER_ERROR");

	expect(conflict.retainIntent).toBe(false);
	expect(validation.retainIntent).toBe(false);
	expect(transport.retainIntent).toBe(true);
	expect(canRetryWorkAction(transport)).toBe(true);
	expect(canRetryWorkAction(conflict)).toBe(false);
});

test("lost responses can retry the retained intent after capability refresh", () => {
	const intent = {
		action: "complete" as const,
		input: { id: "work-1", expectedVersion: 4, clientRequestId: "request-1" },
	};
	const intentRef: { current: typeof intent | null } = { current: null };
	rememberWorkActionIntent(intentRef, intent);
	const lostResponse = workActionRetryState(
		intentRef.current?.action ?? null,
		undefined,
	);

	expect(lostResponse).toEqual({
		action: "complete",
		retryable: true,
		retainIntent: true,
	});
	expect(canRetryWorkAction(lostResponse)).toBe(true);
	expect(intentRef.current).toBe(intent);
	expect(intentRef.current?.input.clientRequestId).toBe("request-1");
});

test("terminal status remains rendered when capabilities become empty", () => {
	expect(workActions).not.toContain("if (!primary) return null");
	expect(workActions).toContain("{primary ? (");
	expect(workActions).toContain('status?.kind === "success"');
});

test("successful mutation owner resets dialog state from the result", () => {
	expect(workActions).toContain("closeDialog(result.ownerId)");
	expect(resetWorkDialogState("owner-from-result").assigneeId).toBe(
		"owner-from-result",
	);
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
