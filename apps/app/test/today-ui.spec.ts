import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	approvalIntentAfterError,
	approvalIntentFingerprint,
	canRetryApprovalIntent,
	classifyApprovalActionError,
	createApprovalIntent,
	retryApprovalIntent,
} from "../app/(app)/[slug]/approval-action-intent";
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
const prefetch = readFileSync(
	resolve(appRoot, "components/crm/section-prefetch.ts"),
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
	expect(prefetch).toContain("trpc.today.get.queryOptions({ limit: 25 })");
	expect(todayPage).toContain(
		"trpc.approval.detail.queryOptions({ id: approval })",
	);
});

test("approval actions remain server-capability and integrity gated", () => {
	expect(approvalSheet).toContain("approval.viewer.canApprove");
	expect(approvalSheet).toContain("approval.viewer.canReject");
	expect(approvalSheet).toContain("approval.viewer.canInvalidate");
	expect(approvalSheet).toContain("!current?.integrityValid");
	expect(approvalSheet).toContain("createApprovalIntent");
	expect(approvalSheet).toContain("retryApprovalIntent(nextIntent)");
	expect(approvalSheet).toContain("send(intent.current)");
	expect(approvalSheet).not.toContain("crypto.randomUUID()");
	expect(todayDesk).toContain('key={approvalId ?? "closed"}');
	expect(approvalSheet).toContain('aria-live="polite"');
	expect(approvalSheet).toContain('aria-live="assertive"');
});

test("approval intents keep exact retry input and rotate ordinary actions", () => {
	const snapshot = {
		id: "approval-1",
		version: 2,
		contentDigest: "digest-1",
		invalidationVersion: 0,
	};
	const first = createApprovalIntent("approve", snapshot, () => "request-1");
	const retry = createApprovalIntent("approve", snapshot, () => "request-2");
	const changed = createApprovalIntent(
		"approve",
		{ ...snapshot, version: 3 },
		() => "request-3",
	);
	const differentOperation = createApprovalIntent(
		"reject",
		snapshot,
		() => "request-4",
	);

	expect(retry.input.clientRequestId).not.toBe(first.input.clientRequestId);
	expect(approvalIntentAfterError(first, { retryable: true })).toEqual(first);
	expect(approvalIntentAfterError(first, { retryable: false })).toBeNull();
	expect(changed.input.clientRequestId).toBe("request-3");
	expect(differentOperation.input.clientRequestId).toBe("request-4");
	expect(approvalIntentFingerprint("approve", snapshot)).toBe(
		first.fingerprint,
	);

	const approvedRetry = retryApprovalIntent(first);
	expect(approvedRetry).toBe(first.input);
	expect(approvedRetry).toEqual(first.input);
	expect(approvedRetry).toEqual({
		id: "approval-1",
		expectedVersion: 2,
		contentDigest: "digest-1",
		invalidationVersion: 0,
		clientRequestId: "request-1",
	});
	const currentApprovedDetail = {
		...snapshot,
		version: 3,
		status: "APPROVED",
	};
	const freshAfterCommit = createApprovalIntent(
		"approve",
		currentApprovedDetail,
		() => "request-after-commit",
	);
	expect(freshAfterCommit.input).not.toEqual(approvedRetry);

	const invalidate = createApprovalIntent(
		"invalidate",
		snapshot,
		() => "request-invalidate",
	);
	expect(retryApprovalIntent(invalidate)).toEqual({
		...invalidate.input,
		expectedVersion: 2,
		invalidationVersion: 0,
	});
	expect(retryApprovalIntent(invalidate)).not.toEqual({
		...invalidate.input,
		expectedVersion: 3,
		invalidationVersion: 1,
	});
	const currentInvalidatedDetail = {
		...snapshot,
		version: 3,
		invalidationVersion: 1,
		status: "INVALIDATED",
	};
	const freshInvalidated = createApprovalIntent(
		"invalidate",
		currentInvalidatedDetail,
		() => "request-after-invalidate",
	);
	const invalidatedRetry = retryApprovalIntent(invalidate);
	expect(invalidatedRetry).toBe(invalidate.input);
	expect(invalidatedRetry).toEqual({
		...invalidate.input,
		expectedVersion: 2,
		invalidationVersion: 0,
	});
	expect(freshInvalidated.input).not.toEqual(invalidatedRetry);
	expect(
		canRetryApprovalIntent(
			first,
			{ operation: "approve", retryable: true },
			true,
			false,
		),
	).toBe(false);
	expect(
		canRetryApprovalIntent(
			first,
			{ operation: "approve", retryable: true },
			true,
			true,
		),
	).toBe(true);
});

test("approval errors retain only transport/server intents and classify conflicts", () => {
	const transport = classifyApprovalActionError(new TypeError("offline"));
	const server = classifyApprovalActionError({
		data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
	});
	const conflict = classifyApprovalActionError({
		data: { code: "CONFLICT", httpStatus: 409 },
	});
	const auth = classifyApprovalActionError({
		data: { code: "FORBIDDEN", httpStatus: 403 },
	});

	expect(transport.retryable).toBe(true);
	expect(server.retryable).toBe(true);
	expect(conflict.retryable).toBe(false);
	expect(auth.retryable).toBe(false);
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
