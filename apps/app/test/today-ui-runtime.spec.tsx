import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	type ApprovalActionError,
	createApprovalIntent,
} from "../app/(app)/[slug]/approval-action-intent";
import {
	type Approval,
	ApprovalFocus,
} from "../app/(app)/[slug]/approval-focus-sheet";
import { type TodayRow, TodayRowView } from "../app/(app)/[slug]/today-desk";

const approval: Approval = {
	id: "approval-1",
	action: "marketing.review",
	contentSnapshot: { subject: "Safe review" },
	contentDigest: "digest-1",
	target: { id: "company-1", type: "COMPANY", label: "Acme" },
	risk: "MEDIUM",
	policyVersion: "policy-1",
	expiresAt: "2026-08-12T12:00:00.000Z",
	invalidationVersion: 0,
	version: 2,
	status: "PENDING",
	integrityValid: true,
	viewer: {
		canApprove: true,
		canReject: false,
		canInvalidate: false,
	},
};

function renderApproval(
	overrides: Partial<Approval> = {},
	options: {
		actionError?: ApprovalActionError | null;
		intent?: ReturnType<typeof createApprovalIntent> | null;
		resultMessage?: string;
	} = {},
): string {
	return renderToStaticMarkup(
		<ApprovalFocus
			approval={{ ...approval, ...overrides }}
			detailReady
			pending={false}
			resultMessage={options.resultMessage ?? ""}
			actionError={options.actionError ?? null}
			intent={options.intent ?? null}
			onAction={() => undefined}
			onRetry={() => undefined}
		/>,
	);
}

function todayRow(kind: string, id: string): TodayRow {
	return {
		kind,
		id,
		state: kind === "approval" ? "PENDING" : "OPEN",
		queue: kind === "approval" ? "approvals" : "ops",
		urgency: "HIGH",
		reason: "Needs attention",
		primaryAction: "Review next",
		evidence: null,
		owner: null,
		subject: {
			type: "COMPANY",
			id: "company-1",
			label: "Acme",
			missing: false,
		},
		dueAt: null,
		nextReviewAt: null,
		version: 1,
		startedAt: null,
		updatedAt: "2026-08-11T12:00:00.000Z",
	} as unknown as TodayRow;
}

test("runtime approval markup follows server capabilities", () => {
	const html = renderApproval();

	expect(html).toMatch(/>Approve<\/button>/);
	expect(html).not.toMatch(/>Reject<\/button>/);
	expect(html).not.toMatch(/>Invalidate<\/button>/);
});

test("runtime integrity failure disables decisions and hides retry", () => {
	const intent = createApprovalIntent(
		"approve",
		{
			id: approval.id,
			version: approval.version,
			contentDigest: approval.contentDigest,
			invalidationVersion: approval.invalidationVersion,
		},
		() => "request-1",
	);
	const html = renderApproval(
		{
			integrityValid: false,
			viewer: { canApprove: true, canReject: true, canInvalidate: true },
		},
		{
			actionError: {
				operation: "approve",
				message: "temporary failure",
				retryable: true,
			},
			intent,
		},
	);

	expect(html).not.toMatch(/>Retry Approval<\/button>/);
	expect(html).toMatch(
		/<button[^>]*disabled[^>]*>[\s\S]*Approve[\s\S]*<\/button>/,
	);
});

test("runtime markup keeps retry visible after a committed state advances", () => {
	const intent = createApprovalIntent(
		"approve",
		{
			id: approval.id,
			version: 2,
			contentDigest: approval.contentDigest,
			invalidationVersion: 0,
		},
		() => "request-historical",
	);
	const html = renderApproval(
		{
			version: 3,
			status: "APPROVED",
			viewer: { canApprove: false, canReject: false, canInvalidate: false },
		},
		{
			actionError: {
				operation: "approve",
				message: "response lost",
				retryable: true,
			},
			intent,
		},
	);

	expect(html).toMatch(/>Retry Approval<\/button>/);
});

test("runtime markup exposes live status, errors, and accessible approval labels", () => {
	const html = renderApproval(
		{},
		{
			actionError: {
				operation: "approve",
				message: "Approval is stale",
				retryable: false,
			},
			resultMessage: "Approval recorded",
		},
	);

	expect(html).toContain('aria-live="polite"');
	expect(html).toContain('role="status"');
	expect(html).toContain('aria-live="assertive"');
	expect(html).toContain('role="alert"');

	const workHtml = renderToStaticMarkup(
		<TodayRowView
			row={todayRow("work", "work/1?next")}
			workspaceUrl={(path) => `/workspace${path ?? ""}`}
			onApproval={() => undefined}
		/>,
	);
	const approvalHtml = renderToStaticMarkup(
		<TodayRowView
			row={todayRow("approval", "approval-1")}
			workspaceUrl={(path) => `/workspace${path ?? ""}`}
			onApproval={() => undefined}
		/>,
	);

	expect(workHtml).toContain("/workspace/work?work=work%2F1%3Fnext");
	expect(workHtml).toContain('aria-label="Open work: Acme"');
	expect(approvalHtml).toContain("<button");
	expect(approvalHtml).toContain('aria-label="Review approval: Acme"');
});
