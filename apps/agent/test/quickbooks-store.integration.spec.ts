import { afterAll, beforeEach, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { QuickBooksConfig } from "../agent/lib/quickbooks-config";
import {
	quickBooksStore,
	sealQuickBooksTokens,
} from "../agent/lib/quickbooks-store";

const config: QuickBooksConfig = {
	clientId: "test-client",
	clientSecret: "test-secret",
	realmId: "123456",
	environment: "sandbox",
	encryptionKey: "ab".repeat(32),
};
const original = { accessToken: "old-access", refreshToken: "old-refresh" };
const rotated = { accessToken: "new-access", refreshToken: "new-refresh" };

beforeEach(async () => {
	await db.quickBooksConnection.deleteMany();
	await db.quickBooksConnection.create({
		data: {
			id: "workspace",
			realmId: config.realmId,
			environment: config.environment,
			encryptedTokens: sealQuickBooksTokens(original, config),
			enrolledBy: "test-owner",
			verifiedAt: new Date(),
		},
	});
});

afterAll(async () => {
	await db.quickBooksConnection.deleteMany();
});

it("serializes concurrent refreshes and persists the rotated pair for new instances", async () => {
	const first = quickBooksStore(db, config);
	const second = quickBooksStore(db, config);
	let refreshCount = 0;
	const refresh = async () => {
		refreshCount++;
		await new Promise((resolve) => setTimeout(resolve, 30));
		return rotated;
	};
	const grants = await Promise.all([
		first.rotate(original.accessToken, refresh),
		second.rotate(original.accessToken, refresh),
	]);
	expect(refreshCount).toBe(1);
	expect(grants.map((grant) => grant.tokens)).toEqual([rotated, rotated]);
	expect((await quickBooksStore(db, config).read()).tokens).toEqual(rotated);
});

it("rolls back a failed refresh and preserves the original pair", async () => {
	const store = quickBooksStore(db, config);
	await expect(
		store.rotate(original.accessToken, async () => {
			throw new Error("refresh refused");
		}),
	).rejects.toThrow("refresh refused");
	expect((await store.read()).tokens).toEqual(original);
});

it("refuses an unverified enrollment before refreshing", async () => {
	await db.quickBooksConnection.update({
		where: { id: "workspace" },
		data: { verifiedAt: null },
	});
	let calls = 0;
	await expect(
		quickBooksStore(db, config).rotate(original.accessToken, async () => {
			calls++;
			return rotated;
		}),
	).rejects.toThrow("unverified");
	expect(calls).toBe(0);
});

it("refuses a mismatched realm before decrypting or refreshing", async () => {
	await expect(
		quickBooksStore(db, { ...config, realmId: "999" }).read(),
	).rejects.toThrow("does not match");
});
