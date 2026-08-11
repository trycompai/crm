import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const require = createRequire(import.meta.url);
const { createWindow } = require(
	resolve(
		import.meta.dir,
		"../../../node_modules/.bun/node_modules/@mixmark-io/domino",
	),
);
const browserWindow = createWindow("<html><body></body></html>");
browserWindow.matchMedia = () => ({
	matches: false,
	media: "",
	onchange: null,
	addListener: () => undefined,
	removeListener: () => undefined,
	addEventListener: () => undefined,
	removeEventListener: () => undefined,
	dispatchEvent: () => false,
});
browserWindow.requestAnimationFrame = (callback: FrameRequestCallback) =>
	setTimeout(() => callback(Date.now()), 0) as unknown as number;
browserWindow.cancelAnimationFrame = (id: number) => clearTimeout(id);
Object.assign(globalThis, {
	window: browserWindow,
	document: browserWindow.document,
	navigator: browserWindow.navigator,
	HTMLElement: browserWindow.HTMLElement,
	Node: browserWindow.Node,
	Element: browserWindow.Element,
	Event: browserWindow.Event,
	MouseEvent: browserWindow.MouseEvent,
	KeyboardEvent: browserWindow.KeyboardEvent,
	IS_REACT_ACT_ENVIRONMENT: true,
});

type MutationOutcome =
	| { kind: "success"; receiptId: string }
	| { kind: "error"; error: unknown; committed?: Partial<ApprovalFixture> };

type ApprovalFixture = {
	id: string;
	action: string;
	contentSnapshot: Record<string, string>;
	contentDigest: string;
	target: { id: string; type: string; label: string };
	risk: string;
	policyVersion: string;
	expiresAt: string;
	invalidationVersion: number;
	version: number;
	status: string;
	integrityValid: boolean;
	viewer: {
		canApprove: boolean;
		canReject: boolean;
		canInvalidate: boolean;
	};
};

const approvalFixture: ApprovalFixture = {
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

function todayRow(kind: string, id: string) {
	return {
		kind,
		id,
		state: kind === "approval" ? "PENDING" : "OPEN",
		queue: kind,
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
	};
}

const todayData = {
	viewer: { role: "admin", isAdmin: true, mode: "owner" },
	sections: {
		doNext: { rows: [todayRow("work", "work/1?next")], total: 1 },
		needsApproval: { rows: [todayRow("approval", "approval-1")], total: 1 },
		waiting: { rows: [todayRow("work", "waiting-1")], total: 1 },
		blockedOrFailed: { rows: [todayRow("work", "blocked-1")], total: 1 },
		running: { rows: [todayRow("agentRun", "run-1")], total: 1 },
		incidents: { rows: [todayRow("incident", "incident-1")], total: 1 },
	},
};

let approvalId: string | null = null;
let queryEvents: Array<{ value: string | null; history: string }> = [];
let currentApproval: ApprovalFixture = approvalFixture;
let mutationOutcomes: MutationOutcome[] = [];
let mutationCalls: Array<{
	operation: string;
	input: Record<string, unknown>;
}> = [];
let cacheCalls: string[] = [];

mock.module("nuqs", () => ({
	parseAsString: {},
	useQueryState: () => {
		const React = require("react");
		const [value, setValue] = React.useState(approvalId);
		return [
			value,
			(nextValue: string | null, options: { history: string }) => {
				approvalId = nextValue;
				queryEvents.push({ value: nextValue, history: options.history });
				setValue(nextValue);
			},
		] as const;
	},
}));

mock.module("@/lib/use-workspace-url", () => ({
	useWorkspaceUrl:
		() =>
		(path = "") =>
			`/workspace${path}`,
}));

mock.module("@/lib/trpc/cache", () => ({
	useCrmCache: () => ({
		approval: async (id: string) => {
			cacheCalls.push(id);
		},
	}),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		today: {
			get: { queryOptions: () => ({ queryKey: ["today"] }) },
		},
		approval: {
			detail: {
				queryOptions: ({ id }: { id: string }) => ({
					queryKey: ["approval", id],
				}),
			},
			approve: {
				mutationOptions: (options: Record<string, unknown>) => ({
					operation: "approve",
					...options,
				}),
			},
			reject: {
				mutationOptions: (options: Record<string, unknown>) => ({
					operation: "reject",
					...options,
				}),
			},
			invalidate: {
				mutationOptions: (options: Record<string, unknown>) => ({
					operation: "invalidate",
					...options,
				}),
			},
		},
	}),
}));

mock.module("@tanstack/react-query", () => ({
	useQuery: (options: { queryKey: string[] }) => {
		if (options.queryKey[0] === "today") {
			return {
				data: todayData,
				isPending: false,
				isError: false,
				isFetching: false,
				refetch: async () => undefined,
			};
		}
		return {
			data: approvalId ? currentApproval : undefined,
			isPending: false,
			isError: false,
			isFetching: false,
			refetch: async () => undefined,
		};
	},
	useMutation: (options: {
		operation: string;
		onSuccess?: (result: unknown) => unknown;
		onError?: (error: unknown) => unknown;
	}) => ({
		isPending: false,
		mutate: (input: Record<string, unknown>) => {
			mutationCalls.push({ operation: options.operation, input });
			const outcome = mutationOutcomes.shift() ?? {
				kind: "success" as const,
				receiptId: "receipt-default",
			};
			if (outcome.kind === "error") {
				if (outcome.committed) {
					currentApproval = { ...currentApproval, ...outcome.committed };
				}
				void options.onError?.(outcome.error);
				return;
			}
			void options.onSuccess?.({ receipt: { id: outcome.receiptId } });
		},
	}),
}));

mock.module("@/components/local-date-time", () => ({
	LocalDateTime: ({ date }: { date: string }) => <time>{date}</time>,
}));

mock.module("@/components/detail-sheet", () => ({
	DetailSheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
		open ? <div data-sheet>{children}</div> : null,
	DetailSheetBody: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	DetailSheetEmpty: ({ title }: { title: string }) => <div>{title}</div>,
	DetailSheetHeader: ({
		title,
		onClose,
	}: {
		title: string;
		onClose: () => void;
	}) => (
		<header>
			<button type="button" aria-label="Close approval" onClick={onClose}>
				{title}
			</button>
		</header>
	),
	DetailSheetProperties: ({ children }: { children: ReactNode }) => (
		<dl>{children}</dl>
	),
	DetailSheetProperty: ({
		label,
		children,
	}: {
		label: string;
		children: ReactNode;
	}) => (
		<div>
			<dt>{label}</dt>
			<dd>{children}</dd>
		</div>
	),
	DetailSheetProse: ({ children }: { children: ReactNode }) => (
		<p>{children}</p>
	),
	DetailSheetSection: ({
		title,
		children,
	}: {
		title: string;
		children: ReactNode;
	}) => (
		<section>
			<h2>{title}</h2>
			{children}
		</section>
	),
}));

mock.module("next/link", () => ({
	default: ({
		href,
		children,
		prefetch: _prefetch,
		...props
	}: {
		href: string;
		children: ReactNode;
		prefetch?: boolean;
	}) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

const { TodayDesk } = await import("../app/(app)/[slug]/today-desk");

let root: Root;
let container: HTMLDivElement;

async function renderDesk() {
	await act(async () => {
		root.render(<TodayDesk />);
	});
}

async function click(element: Element) {
	await act(async () => {
		(element as HTMLElement).click();
		await Promise.resolve();
	});
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

function buttonWithText(text: string): HTMLButtonElement {
	const button = Array.from(container.querySelectorAll("button")).find((item) =>
		item.textContent?.includes(text),
	);
	if (!(button instanceof browserWindow.HTMLElement)) {
		throw new Error(`Missing button: ${text}`);
	}
	return button as HTMLButtonElement;
}

beforeEach(() => {
	approvalId = null;
	queryEvents = [];
	currentApproval = { ...approvalFixture };
	mutationOutcomes = [];
	mutationCalls = [];
	cacheCalls = [];
	container = document.createElement("div") as HTMLDivElement;
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

test("TodayDesk renders all six queues and uses keyboard-capable focus rows", async () => {
	await renderDesk();

	for (const title of [
		"Do next",
		"Needs approval",
		"Waiting",
		"Blocked or failed",
		"Running",
		"Incidents",
	]) {
		expect(container.textContent).toContain(title);
	}

	const approvalRow = container.querySelector<HTMLButtonElement>(
		'button[aria-label="Review approval: Acme"]',
	);
	expect(approvalRow?.tagName).toBe("BUTTON");
	expect(typeof approvalRow?.focus).toBe("function");
	expect(approvalRow?.tabIndex).toBeGreaterThanOrEqual(0);
	const workLink = container.querySelector(
		'a[href="/workspace/work?work=work%2F1%3Fnext"]',
	);
	expect(workLink).not.toBeNull();
	await click(approvalRow as Element);
	expect(queryEvents[0]).toEqual({ value: "approval-1", history: "push" });
});

test("ApprovalFocusSheet sends exact input, reuses it on retry, and refreshes cache", async () => {
	await renderDesk();
	await click(
		container.querySelector(
			'button[aria-label="Review approval: Acme"]',
		) as Element,
	);
	mutationOutcomes.push({
		kind: "error",
		error: { data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } },
		committed: {
			version: 3,
			status: "APPROVED",
			viewer: {
				canApprove: false,
				canReject: false,
				canInvalidate: false,
			},
		},
	});
	await click(buttonWithText("Approve"));

	const firstInput = mutationCalls[0]?.input;
	expect(firstInput).toEqual({
		id: "approval-1",
		expectedVersion: 2,
		contentDigest: "digest-1",
		invalidationVersion: 0,
		clientRequestId: expect.any(String),
	});
	expect(cacheCalls).toEqual(["approval-1"]);
	expect(container.textContent).toContain("The approval action failed.");

	mutationOutcomes.push({ kind: "success", receiptId: "receipt-replayed" });
	await click(buttonWithText("Retry Approval"));
	expect(mutationCalls[1]?.input).toEqual(firstInput);
	expect(cacheCalls).toEqual(["approval-1", "approval-1"]);
	expect(container.textContent).toContain("Receipt receipt-replayed");
});

test("closing and reopening replaces URL state and resets approval error state", async () => {
	await renderDesk();
	await click(
		container.querySelector(
			'button[aria-label="Review approval: Acme"]',
		) as Element,
	);
	mutationOutcomes.push({
		kind: "error",
		error: { data: { code: "CONFLICT", httpStatus: 409 } },
	});
	await click(buttonWithText("Approve"));
	await settle();
	expect(container.querySelector('[role="alert"]')?.textContent).toContain(
		"The approval action failed.",
	);

	await click(
		container.querySelector('button[aria-label="Close approval"]') as Element,
	);
	await settle();
	expect(queryEvents[1]).toEqual({ value: null, history: "replace" });
	await click(
		container.querySelector(
			'button[aria-label="Review approval: Acme"]',
		) as Element,
	);
	await settle();
	expect(container.querySelector('[role="alert"]')?.textContent).toBe("");
	expect(container.textContent).not.toContain("Retry Approval");
});
