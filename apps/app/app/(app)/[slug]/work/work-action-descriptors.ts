export type WorkActionName =
	| "claim"
	| "assign"
	| "start"
	| "wait"
	| "block"
	| "complete"
	| "dismiss";

export type WorkActionCapabilities = Record<
	| "canClaim"
	| "canAssign"
	| "canStart"
	| "canWait"
	| "canBlock"
	| "canComplete"
	| "canDismiss",
	boolean
>;

export type WorkActionDescriptor = {
	name: WorkActionName;
	capability: keyof WorkActionCapabilities;
	label: string;
};

const ACTIONS: readonly WorkActionDescriptor[] = [
	{ name: "claim", capability: "canClaim", label: "Claim" },
	{ name: "start", capability: "canStart", label: "Start" },
	{ name: "complete", capability: "canComplete", label: "Complete" },
	{ name: "assign", capability: "canAssign", label: "Assign" },
	{ name: "wait", capability: "canWait", label: "Wait" },
	{ name: "block", capability: "canBlock", label: "Block" },
	{ name: "dismiss", capability: "canDismiss", label: "Dismiss" },
];

export function workActionDescriptors(
	capabilities: WorkActionCapabilities,
): WorkActionDescriptor[] {
	return ACTIONS.filter((action) => capabilities[action.capability]);
}

const NON_RETRYABLE_ERROR_CODES = new Set([
	"BAD_REQUEST",
	"CONFLICT",
	"FORBIDDEN",
	"NOT_FOUND",
	"UNAUTHORIZED",
]);

export function shouldRetryWorkAction(code: string | undefined): boolean {
	return !NON_RETRYABLE_ERROR_CODES.has(code ?? "");
}
