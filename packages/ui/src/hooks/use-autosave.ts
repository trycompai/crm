"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveState = "idle" | "unsaved" | "saving" | "saved" | "failed";

export const AUTOSAVE = { delayMs: 800, savedHoldMs: 2000 } as const;

type Serialized =
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly Serialized[]
	| { readonly [property: string]: Serialized };

function ordered(item: Serialized): Serialized {
	if (!(item instanceof Object) || Array.isArray(item)) return item;
	return Object.fromEntries(
		Object.entries(item).sort(([left], [right]) =>
			left < right ? -1 : left > right ? 1 : 0,
		),
	);
}

export function autosaveKey<TValue>(value: TValue): string {
	return JSON.stringify(value ?? null, (_property, item: Serialized) =>
		ordered(item),
	);
}

export function useAutosave<TValue>(
	value: TValue,
	save: (value: TValue) => Promise<unknown>,
	options: { enabled?: boolean; delayMs?: number; onSaved?: () => void } = {},
): AutosaveState {
	const { enabled = true, delayMs = AUTOSAVE.delayMs, onSaved } = options;

	const key = autosaveKey(value);

	const [state, setState] = useState<AutosaveState>("idle");

	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
	const run = useRef(save);
	const settled = useRef(onSaved);
	const draft = useRef(value);
	const draftKey = useRef(key);
	const written = useRef(key);
	const flying = useRef<string | null>(null);
	const live = useRef(enabled);

	run.current = save;
	settled.current = onSaved;
	draft.current = value;
	draftKey.current = key;
	live.current = enabled;

	const send = useCallback(() => {
		if (flying.current !== null) return;
		const sent = draftKey.current;
		flying.current = sent;
		if (hold.current) clearTimeout(hold.current);
		setState("saving");
		void run.current(draft.current).then(
			() => {
				flying.current = null;
				if (!live.current) return;
				written.current = sent;
				if (draftKey.current !== sent) {
					if (!timer.current) send();
					return;
				}
				setState("saved");
				settled.current?.();
				hold.current = setTimeout(() => setState("idle"), AUTOSAVE.savedHoldMs);
			},
			() => {
				flying.current = null;
				if (!live.current) return;
				if (draftKey.current !== sent) {
					if (!timer.current) send();
					return;
				}
				setState("failed");
			},
		);
	}, []);

	useEffect(() => {
		if (!enabled) {
			written.current = key;
			if (timer.current) {
				clearTimeout(timer.current);
				timer.current = null;
			}
			return;
		}

		if (written.current === key || flying.current === key) {
			setState((current) => (current === "unsaved" ? "idle" : current));
			return;
		}

		if (hold.current) {
			clearTimeout(hold.current);
			hold.current = null;
		}

		setState("unsaved");

		timer.current = setTimeout(() => {
			timer.current = null;
			send();
		}, delayMs);

		return () => {
			if (timer.current) {
				clearTimeout(timer.current);
				timer.current = null;
			}
		};
	}, [key, enabled, delayMs, send]);

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
			if (hold.current) clearTimeout(hold.current);
			if (!live.current) return;
			if (draftKey.current === written.current) return;
			if (flying.current === draftKey.current) return;
			void run.current(draft.current).catch(() => null);
		},
		[],
	);

	return state;
}

export function saveLabel(state: AutosaveState): string {
	if (state === "unsaved") return "Unsaved";
	if (state === "saving") return "Saving…";
	if (state === "failed") return "Save failed";
	return state === "saved" ? "Saved" : "";
}
