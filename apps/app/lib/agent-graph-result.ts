const NODE_KIND_LABEL: Record<string, [string, string]> = {
	EMAIL: ["email", "emails"],
	WAIT: ["wait", "waits"],
	BRANCH: ["branch", "branches"],
	SPLIT: ["A/B split", "A/B splits"],
	EXIT: ["exit", "exits"],
};

const KIND_ORDER = ["EMAIL", "WAIT", "BRANCH", "SPLIT", "EXIT"];

export type GraphWriteBreakdown = {
	kind: string;
	count: number;
	label: string;
};

export type GraphWriteSummary = {
	nodes: number;
	edges: number;
	breakdown: GraphWriteBreakdown[];
	warning: string | null;
};

function listOf(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function fieldOf(value: unknown, key: string): unknown {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)[key]
		: undefined;
}

function kindOf(node: unknown): string | null {
	const kind = fieldOf(node, "kind");
	return typeof kind === "string" && kind in NODE_KIND_LABEL ? kind : null;
}

function firstWarning(output: unknown): string | null {
	for (const warning of listOf(fieldOf(output, "warnings"))) {
		const message = fieldOf(warning, "message");
		if (typeof message === "string" && message) return message;
	}
	return null;
}

export function graphWriteSummary(
	input: unknown,
	output: unknown,
): GraphWriteSummary | null {
	if (fieldOf(output, "ok") !== true) return null;

	const kinds = listOf(fieldOf(input, "nodes"))
		.map(kindOf)
		.filter((kind): kind is string => kind !== null);

	if (kinds.length === 0) return null;

	const counted = new Map<string, number>();
	for (const kind of kinds) counted.set(kind, (counted.get(kind) ?? 0) + 1);

	const breakdown = KIND_ORDER.filter((kind) => counted.has(kind)).map(
		(kind) => {
			const count = counted.get(kind) ?? 0;
			const [one, many] = NODE_KIND_LABEL[kind] ?? [kind, kind];

			return { kind, count, label: count === 1 ? one : many };
		},
	);

	return {
		nodes: kinds.length,
		edges: listOf(fieldOf(input, "edges")).length,
		breakdown,
		warning: firstWarning(output),
	};
}
