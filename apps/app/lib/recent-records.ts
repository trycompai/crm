"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { COMMAND_SEARCH } from "@/lib/command-search-config";

const STORAGE_PREFIX = "crm:recent-records:";

export const entityLogoTone = z.enum(["opaque", "dark", "light"]);

export const recentRecord = z.object({
	kind: z.enum(["company", "contact", "deal"]),
	id: z.string().min(1),
	label: z.string(),
	detail: z.string().nullable(),
	iconUrl: z.string().nullable(),
	iconDarkUrl: z.string().nullable(),
	iconTone: entityLogoTone.nullable(),
	imageUrl: z.string().nullable(),
});

export type RecentRecord = z.infer<typeof recentRecord>;

const recentRecords = z.array(recentRecord);

const listeners = new Set<() => void>();

function storageKey(slug: string): string {
	return `${STORAGE_PREFIX}${slug}`;
}

function readRaw(slug: string): string | null {
	try {
		return window.localStorage.getItem(storageKey(slug));
	} catch {
		return null;
	}
}

export function parseRecentRecords(raw: string | null): RecentRecord[] {
	if (raw === null) return [];

	try {
		return recentRecords.parse(JSON.parse(raw));
	} catch (cause) {
		throw new Error("Recent records contain invalid saved data.", { cause });
	}
}

export function readRecentRecords(raw: string | null) {
	try {
		return { status: "ready", records: parseRecentRecords(raw) } as const;
	} catch (error) {
		return {
			status: "invalid",
			message:
				error instanceof Error
					? error.message
					: "Recent records cannot be read.",
			raw,
		} as const;
	}
}

function publish() {
	for (const listener of listeners) listener();
}

export function recoverRecentRecords(slug: string, raw: string | null) {
	if (readRaw(slug) !== raw) return;
	try {
		window.localStorage.removeItem(storageKey(slug));
		publish();
		toast.error(
			"Recent records contain invalid saved data. The cache is reset.",
			{
				id: "recent-records-invalid",
			},
		);
	} catch {
		toast.error("Recent records cannot be reset in this browser.", {
			id: "recent-records-storage",
		});
	}
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	window.addEventListener("storage", listener);

	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", listener);
	};
}

export function useRecentRecordsRaw(slug: string): string | null {
	return useSyncExternalStore(
		subscribe,
		() => readRaw(slug),
		() => null,
	);
}

export function rememberRecentRecord(slug: string, record: RecentRecord) {
	const parsed = recentRecord.parse(record);
	const state = readRecentRecords(readRaw(slug));
	if (state.status === "invalid") recoverRecentRecords(slug, state.raw);
	const next = [
		parsed,
		...(state.status === "ready" ? state.records : []).filter(
			(entry) => entry.kind !== parsed.kind || entry.id !== parsed.id,
		),
	].slice(0, COMMAND_SEARCH.recents.limit);

	try {
		window.localStorage.setItem(storageKey(slug), JSON.stringify(next));
	} catch {
		toast.error("Recent records cannot be saved in this browser.", {
			id: "recent-records-storage",
		});
		return;
	}

	publish();
}

export function forgetRecentRecord(
	slug: string,
	record: Pick<RecentRecord, "kind" | "id">,
) {
	const state = readRecentRecords(readRaw(slug));
	if (state.status === "invalid") {
		recoverRecentRecords(slug, state.raw);
		return;
	}
	const next = state.records.filter(
		(entry) => entry.kind !== record.kind || entry.id !== record.id,
	);
	try {
		window.localStorage.setItem(storageKey(slug), JSON.stringify(next));
		publish();
	} catch {
		toast.error("Recent records cannot be saved in this browser.", {
			id: "recent-records-storage",
		});
	}
}

export async function resolveRecentRecord(
	load: () => Promise<unknown>,
	onMissing: () => void,
): Promise<boolean> {
	try {
		await load();
		return true;
	} catch (error) {
		const missing = z
			.object({ data: z.object({ code: z.literal("NOT_FOUND") }) })
			.safeParse(error);
		if (!missing.success) throw error;
		onMissing();
		return false;
	}
}
