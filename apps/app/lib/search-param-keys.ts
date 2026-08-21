export const SEARCH_PARAM = {
	list: {
		q: "q",
		sort: "sort",
		dir: "dir",
		page: "page",
		fields: "fields",
		archived: "archived",
	},
	record: {
		stack: "record",
		tab: "tab",
		add: "add",
		thread: "thread",
		timeline: "timeline",
	},
	fieldsSheet: {
		entity: "manageFields",
		field: "manageField",
	},
	dialog: {
		create: "new",
		switcher: "k",
		closeDeal: "closeDeal",
		closeStage: "closeStage",
	},
	overview: {
		scope: "scope",
	},
} as const;

export const RESERVED_SEARCH_PARAM_KEYS: ReadonlySet<string> = new Set(
	Object.values(SEARCH_PARAM).flatMap((group) => Object.values(group)),
);

export function assertUnreservedSearchParamKeys(
	keys: readonly string[],
	owner: string,
): void {
	const clashes = keys.filter((key) => RESERVED_SEARCH_PARAM_KEYS.has(key));
	if (clashes.length === 0) return;
	throw new Error(
		`[${owner}] search param keys already belong to another feature: ${clashes.join(", ")}. Two parsers on one key corrupt each other. Rename the key or add it to SEARCH_PARAM in lib/search-param-keys.ts.`,
	);
}
