"use client";

import { usePathname } from "next/navigation";
import {
	parseAsArrayOf,
	parseAsString,
	parseAsStringLiteral,
	useQueryStates,
} from "nuqs";
import {
	createContext,
	createElement,
	type ReactNode,
	Suspense,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { timelineTabParser } from "@/components/crm/timeline/timeline-search-params";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import {
	closeRecordNavigation,
	getRecordNavigation,
	moveRecordNavigation,
	openRecordNavigation,
	type RecordQueueContext,
} from "./record-navigation";

const RECORD_KINDS = ["company", "contact", "deal"] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];

export type RecordRef = { kind: RecordKind; id: string };

const RECORD_FORMS = ["contact", "deal"] as const;

export type RecordForm = (typeof RECORD_FORMS)[number];

const FORM_TAB = {
	contact: "contacts",
	deal: "deals",
} satisfies Record<RecordForm, string>;

const params = {
	[SEARCH_PARAM.record.stack]: parseAsArrayOf(parseAsString, ",").withDefault(
		[],
	),
	[SEARCH_PARAM.record.tab]: parseAsString,
	[SEARCH_PARAM.record.add]: parseAsStringLiteral(RECORD_FORMS),
	[SEARCH_PARAM.record.thread]: parseAsString,
	[SEARCH_PARAM.fieldsSheet.entity]: parseAsStringLiteral(RECORD_KINDS),
	[SEARCH_PARAM.fieldsSheet.field]: parseAsString,
	[SEARCH_PARAM.record.timeline]: timelineTabParser,
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

function useRecordStackState() {
	const [values, setParams] = useQueryStates(params);
	const pathname = usePathname();
	const record = values[SEARCH_PARAM.record.stack];
	const returnFocus = useRef<HTMLElement | null>(null);
	const [session, setSession] = useState<{
		pathname: string;
		queues: RecordQueueContext[];
	}>({ pathname, queues: [] });
	const queues = session.pathname === pathname ? session.queues : [];

	const stack = useMemo(
		() => record.map(parseRef).filter((ref): ref is RecordRef => ref !== null),
		[record],
	);

	const write = useCallback(
		(next: RecordRef[], history: "push" | "replace") => {
			return setParams(
				{
					[SEARCH_PARAM.record.stack]:
						next.length === 0 ? null : next.map(recordKey),
					[SEARCH_PARAM.record.tab]: null,
					[SEARCH_PARAM.record.add]: null,
					[SEARCH_PARAM.record.thread]: null,
					[SEARCH_PARAM.fieldsSheet.entity]: null,
					[SEARCH_PARAM.fieldsSheet.field]: null,
					[SEARCH_PARAM.record.timeline]: null,
				},
				{ history },
			).then(() => undefined);
		},
		[setParams],
	);

	const open = useCallback(
		(ref: RecordRef, orderedRecordRefs?: readonly RecordRef[]) => {
			if (stack.length === 0 && document.activeElement instanceof HTMLElement) {
				returnFocus.current = document.activeElement;
			}
			const next = openRecordNavigation(stack, queues, ref, orderedRecordRefs);
			setSession({ pathname, queues: next.queues });
			void write(next.stack, next.history);
		},
		[stack, queues, pathname, write],
	);

	const close = useCallback(() => {
		const next = closeRecordNavigation(stack, queues);
		setSession({ pathname, queues: next.queues });
		void write(next.stack, next.history);
	}, [stack, queues, pathname, write]);

	const closeAll = useCallback(() => {
		setSession({ pathname, queues: [] });
		void write([], "replace");
	}, [pathname, write]);

	const restoreFocus = useCallback(() => returnFocus.current?.focus(), []);

	const move = useCallback(
		(direction: -1 | 1) => {
			const next = moveRecordNavigation(stack, queues, direction);
			if (!next) return;
			setSession({ pathname, queues: next.queues });
			void write(next.stack, next.history);
		},
		[stack, queues, pathname, write],
	);
	const position = getRecordNavigation(stack, queues);

	return {
		stack,
		top: stack.at(-1) ?? null,
		open,
		close,
		closeAll,
		restoreFocus,
		navigation: position
			? {
					...position,
					onPrevious: () => move(-1),
					onNext: () => move(1),
				}
			: undefined,
	};
}

type RecordStackState = ReturnType<typeof useRecordStackState>;

const RecordStackContext = createContext<RecordStackState | null>(null);

const EMPTY_RECORD_STACK: RecordStackState = {
	stack: [],
	top: null,
	open: () => undefined,
	close: () => undefined,
	closeAll: () => undefined,
	restoreFocus: () => undefined,
	navigation: undefined,
};

function RecordStackFallbackProvider({ children }: { children: ReactNode }) {
	return createElement(
		RecordStackContext.Provider,
		{ value: EMPTY_RECORD_STACK },
		children,
	);
}

export function RecordStackProvider({ children }: { children: ReactNode }) {
	const state = useRecordStackState();
	return createElement(RecordStackContext.Provider, { value: state }, children);
}

export function RecordStackBoundary({ children }: { children: ReactNode }) {
	return createElement(
		Suspense,
		{
			fallback: createElement(RecordStackFallbackProvider, null, children),
		},
		createElement(RecordStackProvider, null, children),
	);
}

export function useRecordStack(): RecordStackState {
	const state = useContext(RecordStackContext);
	if (!state) throw new Error("RecordStackProvider is missing.");
	return state;
}

export function useOpenRecord() {
	return useRecordStack().open;
}

export function useFieldsSheet() {
	const [values, setParams] = useQueryStates(params);
	const entity = values[SEARCH_PARAM.fieldsSheet.entity];
	const field = values[SEARCH_PARAM.fieldsSheet.field];

	const open = useCallback(
		(kind: RecordKind) =>
			void setParams({
				[SEARCH_PARAM.fieldsSheet.entity]: kind,
				[SEARCH_PARAM.fieldsSheet.field]: null,
			}),
		[setParams],
	);

	const close = useCallback(
		() =>
			void setParams({
				[SEARCH_PARAM.fieldsSheet.entity]: null,
				[SEARCH_PARAM.fieldsSheet.field]: null,
			}),
		[setParams],
	);

	const edit = useCallback(
		(key: string | null) =>
			void setParams({ [SEARCH_PARAM.fieldsSheet.field]: key }),
		[setParams],
	);

	return { entity, field, open, close, edit };
}

export function useRecordSheetView(fallbackTab: string) {
	const [values, setParams] = useQueryStates(params);
	const tab = values[SEARCH_PARAM.record.tab];
	const add = values[SEARCH_PARAM.record.add];
	const thread = values[SEARCH_PARAM.record.thread];

	const active = add ? FORM_TAB[add] : (tab ?? fallbackTab);

	const setTab = useCallback(
		(next: string) => {
			void setParams({
				[SEARCH_PARAM.record.tab]: next === fallbackTab ? null : next,
				[SEARCH_PARAM.record.add]: null,
				[SEARCH_PARAM.record.thread]: null,
				[SEARCH_PARAM.record.timeline]: null,
			});
		},
		[setParams, fallbackTab],
	);

	const setForm = useCallback(
		(next: RecordForm | null) =>
			void setParams({ [SEARCH_PARAM.record.add]: next }),
		[setParams],
	);

	const setThread = useCallback(
		(next: string | null) =>
			void setParams({ [SEARCH_PARAM.record.thread]: next }),
		[setParams],
	);

	return { tab: active, setTab, form: add, setForm, thread, setThread };
}
