import { groupGrantedScopes } from "@crm/mcp-integrations/scopes";
import { MCP_CONNECTION } from "./mcp-connection-config";

type ToolCallKind = "read" | "change" | "risky";
type ToolReviewState = "pending" | "reviewed" | "changed" | "removed";

type Tool = {
	name: string;
	description: string | null;
	fingerprint: string;
	callKind: ToolCallKind;
	reviewState: ToolReviewState;
	lastSeenAt: Date | string;
	presentation?: {
		prose: string;
		code?: {
			highlightedHTML?: string;
			label: string;
			value: string;
		};
	};
};

type Connection = {
	status: "connecting" | "connected" | "error" | "disconnected";
	accessMode: "read_only" | "read_write";
	grantedScopes: string[];
	connectedAt: Date | string | null;
	lastSuccessfulCallAt: Date | string | null;
	lastErrorCode: string | null;
};

type Agent = {
	id: string;
	name: string;
	description: string | null;
	status: "LIVE" | "PAUSED";
};

const TOOL_GROUPS = [
	{
		kind: "read",
		label: "Read",
		description: "Views data without changing it.",
		badgeVariant: "scope-read",
	},
	{
		kind: "change",
		label: "Change",
		description: "Creates or updates data.",
		badgeVariant: "scope-change",
	},
	{
		kind: "risky",
		label: "Sensitive",
		description: "Uses sensitive or destructive access.",
		badgeVariant: "scope-sensitive",
	},
] as const;

const TOOL_REVIEW_LABEL = {
	pending: "Needs review",
	reviewed: "Reviewed",
	changed: "Changed",
	removed: "Removed",
} satisfies Record<ToolReviewState, string>;

export function presentMcpConnection(input: {
	platformSlug: string;
	connection: Connection | null;
	agents: Agent[];
	tools: Tool[];
}) {
	const pendingTools = input.tools.filter(
		(tool) => tool.reviewState === "pending",
	);
	const pendingReadTools = pendingTools
		.filter((tool) => tool.callKind === "read")
		.map(({ name, fingerprint }) => ({ name, fingerprint }));
	const groups = TOOL_GROUPS.map((group) => ({
		...group,
		tools: input.tools
			.filter((tool) => tool.callKind === group.kind)
			.map((tool) => ({
				...tool,
				lastSeenAt:
					tool.lastSeenAt instanceof Date
						? tool.lastSeenAt.toISOString()
						: tool.lastSeenAt,
				reviewLabel: TOOL_REVIEW_LABEL[tool.reviewState],
			})),
	})).filter((group) => group.tools.length > 0);
	const connection = input.connection;
	const scopeGroups = connection
		? groupGrantedScopes(input.platformSlug, connection.grantedScopes)
		: [];
	const compactPermissions =
		scopeGroups.length <= MCP_CONNECTION.permissions.autoExpandGroupLimit;
	const filters: Array<{
		value: "all" | ToolCallKind;
		label: string;
		count: number;
	}> = [
		{ value: "all", label: "All", count: input.tools.length },
		...TOOL_GROUPS.map((group) => ({
			value: group.kind,
			label: group.label,
			count: input.tools.filter((tool) => tool.callKind === group.kind).length,
		})),
	];

	return {
		pendingReviewCount: pendingTools.length,
		pendingReadTools,
		groups,
		filters,
		overview: connection
			? {
					failure:
						connection.lastErrorCode || connection.status === "error"
							? {
									title: "The last connection attempt failed.",
									code: connection.lastErrorCode ?? "unknown_error",
								}
							: null,
					scopeCount: connection.grantedScopes.length,
					scopeGroups,
					permissionPanelSize: compactPermissions
						? ("content" as const)
						: ("scroll" as const),
					defaultOpenScopeGroups: compactPermissions
						? scopeGroups.map((group) => group.id)
						: [],
					agents: input.agents.map((agent) => ({
						...agent,
						statusLabel: agent.status === "LIVE" ? "Running" : "Paused",
					})),
				}
			: null,
	};
}
