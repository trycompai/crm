"use client";

import {
	parseAsArrayOf,
	parseAsString,
	parseAsStringLiteral,
	useQueryStates,
} from "nuqs";
import { useCallback, useMemo } from "react";
import {
	TIMELINE_PARAM,
	timelineTabParser,
} from "@/components/crm/timeline/timeline-search-params";

const RECORD_KINDS = ["company", "contact", "deal"] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];

export type RecordRef = { kind: RecordKind; id: string };

const RECORD_FORMS = ["contact", "deal"] as const;

export type RecordForm = (typeof RECORD_FORMS)[number];

const FORM_TAB: Record<RecordForm, string> = {
	contact: "contacts",
	deal: "deals",
};

const params = {
	record: parseAsArrayOf(parseAsString, ",").withDefault([]),
	tab: parseAsString,
	add: parseAsStringLiteral(RECORD_FORMS),
	thread: parseAsString,
	fields: parseAsStringLiteral(RECORD_KINDS),
	field: parseAsString,
	[TIMELINE_PARAM]: timelineTabParser,
};

export function recordKey(ref: RecordRef): string {
	return `${ref.kind}:${ref.id}`;
}

function parseRef(raw: string): RecordRef | null {
	const [kind, ...rest] = raw.split(":");
	const id = rest.join(":");
	if (!id) return null;
	return RECORD_KINDS.includes(kind as RecordKind)
		? { kind: kind as RecordKind, id }
		: null;
}

export function useRecordStack() {
	const [{ record }, setParams] = useQueryStates(params);

	const stack = useMemo(
		() => record.map(parseRef).filter((ref): ref is RecordRef => ref !== null),
		[record],
	);

	const write = useCallback(
		(next: RecordRef[], history: "push" | "replace") => {
			void setParams(
				{
					record: next.length === 0 ? null : next.map(recordKey),
					tab: null,
					add: null,
					thread: null,
					fields: null,
					field: null,
					[TIMELINE_PARAM]: null,
				},
				{ history },
			);
		},
		[setParams],
	);

	const open = useCallback(
		(ref: RecordRef) => {
			const key = recordKey(ref);
			write(
				[...stack.filter((entry) => recordKey(entry) !== key), ref],
				stack.length === 0 ? "push" : "replace",
			);
		},
		[stack, write],
	);

	const close = useCallback(
		() => write(stack.slice(0, -1), "replace"),
		[stack, write],
	);

	const closeAll = useCallback(() => write([], "replace"), [write]);

	return {
		stack,
		top: stack.at(-1) ?? null,
		open,
		close,
		closeAll,
	};
}

export function useOpenRecord() {
	return useRecordStack().open;
}

export function useFieldsSheet() {
	const [{ fields, field }, setParams] = useQueryStates(params);

	const open = useCallback(
		(kind: RecordKind) => void setParams({ fields: kind, field: null }),
		[setParams],
	);

	const close = useCallback(
		() => void setParams({ fields: null, field: null }),
		[setParams],
	);

	const edit = useCallback(
		(key: string | null) => void setParams({ field: key }),
		[setParams],
	);

	return { entity: fields, field, open, close, edit };
}

export function useRecordSheetView(fallbackTab: string) {
	const [{ tab, add, thread }, setParams] = useQueryStates(params);

	const active = add ? FORM_TAB[add] : (tab ?? fallbackTab);

	const setTab = useCallback(
		(next: string) => {
			void setParams({
				tab: next === fallbackTab ? null : next,
				add: null,
				thread: null,
				[TIMELINE_PARAM]: null,
			});
		},
		[setParams, fallbackTab],
	);

	const setForm = useCallback(
		(next: RecordForm | null) => void setParams({ add: next }),
		[setParams],
	);

	const setThread = useCallback(
		(next: string | null) => void setParams({ thread: next }),
		[setParams],
	);

	return { tab: active, setTab, form: add, setForm, thread, setThread };
}
