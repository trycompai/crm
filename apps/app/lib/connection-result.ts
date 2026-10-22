import type { ProviderBrand } from "@crm/ui/lib/provider-brand";
import type { EveToolOutput } from "@crm/validation/eve-tool";
import { z } from "zod";
import { CONNECTION_RESULT } from "./connection-result-config";

const jsonValue = z.json();
const jsonArray = z.array(jsonValue);
const recordValue = z.record(z.string(), z.json());
const booleanValue = z.boolean();
const numberValue = z.number();
const stringValue = z.string();

type JsonValue = z.infer<typeof jsonValue>;

type ResultCollection = {
	key: string | null;
	values: readonly JsonValue[];
	isCollection: boolean;
};

export type SupportedResultProvider = {
	slug: string;
	name: string;
	brand?: ProviderBrand | null;
};

export type ProviderCardItem = {
	key: string;
	title?: string;
	reference?: string;
	href?: string;
	details: readonly { label: string; value: string }[];
	tags: readonly string[];
};

export type ProviderCardModel = {
	slug: string;
	provider: string;
	brand?: ProviderBrand | null;
	title: string;
	countLabel?: string;
	items: readonly ProviderCardItem[];
};

export function providerForTool(
	tool: string,
	providers: readonly SupportedResultProvider[],
): SupportedResultProvider | null {
	const separator = tool.indexOf("__");
	if (separator < 1) return null;
	const slug = tool.slice(0, separator);
	return providers.find((provider) => provider.slug === slug) ?? null;
}

export function providerCardOf({
	provider,
	tool,
	output,
}: {
	provider: SupportedResultProvider;
	tool: string;
	output: EveToolOutput;
}): ProviderCardModel | null {
	const value = parseOutput(output);
	if (value === null) return null;
	const collection = collectionOf(value);
	const items = collection.values
		.slice(0, CONNECTION_RESULT.limits.items)
		.map((item, index) => itemOf(item, index))
		.filter((item) => item !== null);
	if (items.length === 0) return null;

	const noun = titleOf(tool, collection.key);
	const model: ProviderCardModel = {
		slug: provider.slug,
		provider: provider.name,
		title: noun,
		items,
	};
	if (provider.brand) model.brand = provider.brand;
	if (collection.isCollection)
		model.countLabel = countLabel(items.length, noun);
	return model;
}

function parseOutput(output: EveToolOutput): JsonValue | null {
	const text = stringValue.safeParse(output);
	if (!text.success) return output;
	const source = text.data.trim();
	if (!source) return null;

	for (const candidate of [source, source.split("\n", 1)[0]]) {
		if (!candidate) continue;
		try {
			const parsed = jsonValue.safeParse(JSON.parse(candidate));
			if (parsed.success) return parsed.data;
		} catch {}
	}

	return safeText(source, CONNECTION_RESULT.limits.titleLength);
}

function collectionOf(value: JsonValue): ResultCollection {
	const directArray = jsonArray.safeParse(value);
	if (directArray.success) {
		return { key: null, values: directArray.data, isCollection: true };
	}
	const record = recordValue.safeParse(value);
	if (!record.success) {
		return { key: null, values: [value], isCollection: false };
	}

	for (const key of CONNECTION_RESULT.collectionKeys) {
		const candidate = jsonArray.safeParse(record.data[key]);
		if (candidate.success) {
			return { key, values: candidate.data, isCollection: true };
		}
	}

	const arrays = Object.entries(record.data).flatMap(([key, candidate]) => {
		const parsed = jsonArray.safeParse(candidate);
		return parsed.success ? [[key, parsed.data] as const] : [];
	});
	if (arrays.length === 1) {
		return {
			key: arrays[0]?.[0] ?? null,
			values: arrays[0]?.[1] ?? [],
			isCollection: true,
		};
	}

	return { key: null, values: [record.data], isCollection: false };
}

function itemOf(value: JsonValue, index: number): ProviderCardItem | null {
	const record = recordValue.safeParse(value);
	if (!record.success) {
		const title = scalarText(value);
		return title
			? { key: `result-${index}`, title, details: [], tags: [] }
			: null;
	}

	const safeEntries = Object.entries(record.data).filter(
		([key]) => !isSensitiveKey(key),
	);
	const titleEntry = firstEntry(safeEntries, CONNECTION_RESULT.titleKeys);
	const referenceEntry = safeEntries.find(([key, item]) =>
		isReferenceKey(key, item),
	);
	const linkEntry = firstEntry(safeEntries, CONNECTION_RESULT.linkKeys);
	const title = scalarText(titleEntry?.[1]) ?? scalarText(referenceEntry?.[1]);
	const reference = limitedScalar(
		referenceEntry?.[1],
		CONNECTION_RESULT.limits.referenceLength,
	);
	const href = safeUrl(linkEntry?.[1]);
	const tags = tagsOf(safeEntries);
	const excluded = new Set(
		[titleEntry?.[0], referenceEntry?.[0], linkEntry?.[0]].filter(
			(value): value is string => Boolean(value),
		),
	);

	const item: ProviderCardItem = {
		key: reference ?? (title ? `${title}-${index}` : `result-${index}`),
		details: detailsOf(safeEntries, excluded),
		tags,
	};
	if (title) item.title = title;
	if (reference && reference !== title) item.reference = reference;
	if (href) item.href = href;
	return item;
}

function tagsOf(entries: readonly [string, JsonValue][]) {
	const tags: string[] = [];
	for (const [key, value] of entries) {
		if (!CONNECTION_RESULT.tagKeys.includes(key as never)) continue;
		const tag = nestedLabel(value) ?? scalarText(value);
		if (tag) tags.push(humanise(tag));
	}

	for (const [, value] of entries) {
		const children = jsonArray.safeParse(value);
		if (!children.success) continue;
		for (const child of children.data.slice(
			0,
			CONNECTION_RESULT.limits.nestedValues,
		)) {
			const childRecord = recordValue.safeParse(child);
			if (!childRecord.success) continue;
			for (const key of CONNECTION_RESULT.tagKeys) {
				const tag =
					nestedLabel(childRecord.data[key]) ??
					scalarText(childRecord.data[key]);
				if (tag) tags.push(humanise(tag));
			}
		}
	}

	return unique(tags).slice(0, CONNECTION_RESULT.limits.tags);
}

function detailsOf(
	entries: readonly [string, JsonValue][],
	excluded: ReadonlySet<string>,
) {
	const details: { label: string; value: string }[] = [];
	const ordered = [...entries].sort(
		(left, right) => detailRank(left[0]) - detailRank(right[0]),
	);
	for (const [key, value] of ordered) {
		if (
			excluded.has(key) ||
			CONNECTION_RESULT.tagKeys.includes(key as never) ||
			CONNECTION_RESULT.omittedKeys.includes(key as never)
		) {
			continue;
		}
		const list = jsonArray.safeParse(value);
		if (list.success) {
			if (list.data.length > 0) {
				details.push({ label: humanise(key), value: String(list.data.length) });
			}
		} else {
			const display = detailValue(key, value);
			if (display) {
				details.push({ label: detailLabel(key), value: display });
			}
		}
		if (details.length === CONNECTION_RESULT.limits.details) break;
	}
	return details;
}

function detailRank(key: string) {
	const rank = CONNECTION_RESULT.detailKeys.indexOf(key as never);
	return rank < 0 ? CONNECTION_RESULT.detailKeys.length : rank;
}

function detailValue(key: string, value: JsonValue) {
	const scalar = scalarText(value) ?? nestedLabel(value);
	if (!scalar) return null;
	if (key.endsWith("_at")) return dateLabel(scalar);
	return CONNECTION_RESULT.categoricalDetailKeys.includes(key as never)
		? humanise(scalar)
		: scalar;
}

function detailLabel(key: string) {
	if (key === "database_count") return "Databases";
	if (key === "mcp_access_level" || key === "access_level") return "Access";
	if (key === "updated_at") return "Updated";
	if (key === "created_at") return "Created";
	return humanise(key);
}

function dateLabel(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(date);
}

function nestedLabel(value: JsonValue | undefined) {
	const record = recordValue.safeParse(value);
	if (!record.success) return null;
	for (const key of ["name", "label", "title", "version", "type"]) {
		const text = scalarText(record.data[key]);
		if (text) return text;
	}
	return null;
}

function firstEntry(
	entries: readonly [string, JsonValue][],
	keys: readonly string[],
) {
	for (const key of keys) {
		const entry = entries.find(([candidate]) => candidate === key);
		if (entry && scalarText(entry[1])) return entry;
	}
	return undefined;
}

function scalarText(value: JsonValue | undefined) {
	return limitedScalar(value, CONNECTION_RESULT.limits.valueLength);
}

function limitedScalar(value: JsonValue | undefined, limit: number) {
	const boolean = booleanValue.safeParse(value);
	if (boolean.success) return boolean.data ? "Yes" : "No";
	const number = numberValue.safeParse(value);
	if (number.success) return String(number.data);
	const text = stringValue.safeParse(value);
	return text.success ? safeText(text.data, limit) : null;
}

function safeText(value: string, limit: number) {
	const normalized = value
		.replace(/\s*—\s*/g, ": ")
		.replace(/\s+/g, " ")
		.trim();
	if (!normalized || normalized.length > limit) return null;
	return normalized;
}

function safeUrl(value: JsonValue | undefined) {
	const text = stringValue.safeParse(value);
	if (!text.success) return null;
	try {
		const url = new URL(text.data);
		return url.protocol === "https:" || url.protocol === "http:"
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

function isReferenceKey(key: string, value: JsonValue) {
	const text = stringValue.safeParse(value);
	return (
		(key === "id" || key === "uuid" || key.endsWith("_id")) &&
		text.success &&
		text.data.length > 0
	);
}

function isSensitiveKey(key: string) {
	return /(^|_)(token|secret|password|cookie|authorization|api_?key|access_?key|private_?key|publishable_?key|billing_?email)($|_)/i.test(
		key,
	);
}

function titleOf(tool: string, collectionKey: string | null) {
	if (
		collectionKey &&
		!CONNECTION_RESULT.genericCollectionKeys.includes(collectionKey as never)
	) {
		return humanise(collectionKey);
	}
	const separator = tool.indexOf("__");
	const provider = tool.slice(0, separator).replace(/-/g, "_");
	const namespacedAction = tool.slice(separator + 2).replace(/-/g, "_");
	const action = namespacedAction.startsWith(`${provider}_`)
		? namespacedAction.slice(provider.length + 1)
		: namespacedAction;
	if (action === "whoami" || action === "get_self") return "Account";
	const subject = action.replace(
		/^(list|get|search|find|fetch|query|show|read)_/,
		"",
	);
	return subject ? humanise(subject) : "Result";
}

function countLabel(count: number, title: string) {
	const noun = title.toLowerCase();
	if (count === 1) return `1 ${singular(noun)}`;
	return `${count} ${plural(noun)}`;
}

function singular(value: string) {
	return value.endsWith("ies")
		? `${value.slice(0, -3)}y`
		: value.endsWith("s")
			? value.slice(0, -1)
			: value;
}

function plural(value: string) {
	if (value.endsWith("s")) return value;
	return value.endsWith("y") ? `${value.slice(0, -1)}ies` : `${value}s`;
}

function humanise(value: string) {
	return value
		.replace(/([a-z])([A-Z])/g, "$1_$2")
		.split(/[_-]+/)
		.filter(Boolean)
		.map((part) => {
			const lower = part.toLowerCase();
			return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
		})
		.join(" ");
}

function unique(values: readonly string[]) {
	return [...new Set(values)];
}
