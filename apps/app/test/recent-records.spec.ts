import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { toast } from "sonner";
import { COMMAND_SEARCH } from "@/lib/command-search-config";
import {
	forgetRecentRecord,
	parseRecentRecords,
	type RecentRecord,
	readRecentRecords,
	recoverRecentRecords,
	rememberRecentRecord,
	resolveRecentRecord,
} from "@/lib/recent-records";

const key = "crm:recent-records:workspace";
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const storage = new Map<string, string>();

function record(
	id: string,
	kind: RecentRecord["kind"] = "company",
): RecentRecord {
	return {
		kind,
		id,
		label: `Record ${id}`,
		detail: null,
		iconUrl: null,
		iconDarkUrl: null,
		iconTone: null,
		imageUrl: null,
	};
}

beforeEach(() => {
	storage.clear();
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			localStorage: {
				getItem: (name: string) => storage.get(name) ?? null,
				setItem: (name: string, value: string) => storage.set(name, value),
				removeItem: (name: string) => storage.delete(name),
			},
		},
	});
});

afterEach(() => {
	if (originalWindow)
		Object.defineProperty(globalThis, "window", originalWindow);
	else Reflect.deleteProperty(globalThis, "window");
});

describe("recent record cache", () => {
	it("distinguishes missing storage from invalid stored records", () => {
		expect(parseRecentRecords(null)).toEqual([]);
		for (const raw of ["", "broken", "{}", '[{"kind":"company","id":"one"}]']) {
			expect(() => parseRecentRecords(raw)).toThrow("invalid saved data");
			expect(readRecentRecords(raw).status).toBe("invalid");
		}
	});

	it("deduplicates by kind and id, updates metadata, and keeps the recent limit", () => {
		for (let id = 0; id <= COMMAND_SEARCH.recents.limit; id++) {
			rememberRecentRecord("workspace", record(String(id)));
		}
		const updated = { ...record("2"), label: "Renamed" };
		rememberRecentRecord("workspace", updated);
		rememberRecentRecord("workspace", record("2", "contact"));
		const recent = parseRecentRecords(storage.get(key) ?? null);
		expect(recent).toHaveLength(COMMAND_SEARCH.recents.limit);
		expect(recent[0]).toEqual(record("2", "contact"));
		expect(recent[1]).toEqual(updated);
		expect(
			recent.filter((entry) => entry.kind === "company" && entry.id === "2"),
		).toHaveLength(1);
		expect(recent.some((entry) => entry.id === "0")).toBe(false);
	});

	it("reports corrupt storage and saves the newly loaded record after recovery", () => {
		const report = spyOn(toast, "error").mockImplementation(() => "test-toast");
		try {
			storage.set(key, "broken");
			rememberRecentRecord("workspace", record("loaded"));
			expect(parseRecentRecords(storage.get(key) ?? null)).toEqual([
				record("loaded"),
			]);
			expect(report).toHaveBeenCalledWith(
				"Recent records contain invalid saved data. The cache is reset.",
				{ id: "recent-records-invalid" },
			);
		} finally {
			report.mockRestore();
		}
	});

	it("preserves a newer cache write during recovery", () => {
		storage.set(key, JSON.stringify([record("newer")]));
		recoverRecentRecords("workspace", "broken");
		expect(parseRecentRecords(storage.get(key) ?? null)).toEqual([
			record("newer"),
		]);
	});

	it("removes the missing record and preserves another kind with the same id", () => {
		rememberRecentRecord("workspace", record("one"));
		rememberRecentRecord("workspace", record("one", "deal"));
		forgetRecentRecord("workspace", record("one"));
		expect(parseRecentRecords(storage.get(key) ?? null)).toEqual([
			record("one", "deal"),
		]);
	});
});

describe("recent record validation", () => {
	it("opens only after the record read succeeds", async () => {
		let finish: () => void = () => undefined;
		let opened = false;
		const missing: string[] = [];
		const pending = resolveRecentRecord(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
			() => missing.push("missing"),
		).then((exists) => {
			opened = exists;
			return exists;
		});
		await Promise.resolve();
		expect(opened).toBe(false);
		finish();
		expect(await pending).toBe(true);
		expect(opened).toBe(true);
		expect(missing).toEqual([]);
	});

	it("prunes a deleted recent and prevents its sheet from opening", async () => {
		rememberRecentRecord("workspace", record("deleted"));
		const exists = await resolveRecentRecord(
			() => Promise.reject({ data: { code: "NOT_FOUND" } }),
			() => forgetRecentRecord("workspace", record("deleted")),
		);
		expect(exists).toBe(false);
		expect(parseRecentRecords(storage.get(key) ?? null)).toEqual([]);
	});

	it("keeps a recent on network errors and reports the failure", async () => {
		rememberRecentRecord("workspace", record("offline"));
		const error = new Error("Network unavailable");
		await expect(
			resolveRecentRecord(
				() => Promise.reject(error),
				() => forgetRecentRecord("workspace", record("offline")),
			),
		).rejects.toBe(error);
		expect(parseRecentRecords(storage.get(key) ?? null)).toEqual([
			record("offline"),
		]);
	});
});
