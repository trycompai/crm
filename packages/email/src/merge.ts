export type MergeContext = {
	contact?: {
		firstName?: string | null;
		lastName?: string | null;
		email?: string | null;
		title?: string | null;
	} | null;
	company?: { name?: string | null; domain?: string | null } | null;
	workspace?: { name?: string | null } | null;
	sender?: { name?: string | null; email?: string | null } | null;
};

export const MERGE_TAGS = [
	"contact.firstName",
	"contact.lastName",
	"contact.email",
	"contact.title",
	"company.name",
	"company.domain",
	"workspace.name",
	"sender.name",
	"sender.email",
] as const;

export type MergeTag = (typeof MERGE_TAGS)[number];

export const NULLABLE_TAGS: ReadonlySet<string> = new Set([
	"contact.firstName",
	"contact.lastName",
	"contact.title",
	"company.name",
	"company.domain",
	"sender.name",
]);

const PATTERN = /\{\{\s*([a-zA-Z.]+)\s*(?:\|([^}]*))?\}\}/g;

function valueFor(tag: string, context: MergeContext): string | null {
	switch (tag) {
		case "contact.firstName":
			return context.contact?.firstName ?? null;
		case "contact.lastName":
			return context.contact?.lastName ?? null;
		case "contact.email":
			return context.contact?.email ?? null;
		case "contact.title":
			return context.contact?.title ?? null;
		case "company.name":
			return context.company?.name ?? null;
		case "company.domain":
			return context.company?.domain ?? null;
		case "workspace.name":
			return context.workspace?.name ?? null;
		case "sender.name":
			return context.sender?.name ?? null;
		case "sender.email":
			return context.sender?.email ?? null;
		default:
			return null;
	}
}

export function isKnownTag(tag: string): tag is MergeTag {
	return (MERGE_TAGS as readonly string[]).includes(tag);
}

export function tagsIn(
	value: string,
): { tag: string; fallback: string | null }[] {
	const found: { tag: string; fallback: string | null }[] = [];

	for (const match of value.matchAll(PATTERN)) {
		found.push({ tag: match[1] ?? "", fallback: match[2] ?? null });
	}

	return found;
}

export function resolveMerge(value: string, context: MergeContext): string {
	return value.replace(PATTERN, (_whole, rawTag: string, fallback?: string) => {
		const tag = rawTag.trim();
		if (!isKnownTag(tag)) return fallback?.trim() ?? "";
		return valueFor(tag, context) ?? fallback?.trim() ?? "";
	});
}
