import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Db } from "@crm/db/client";
import { z } from "zod";
import {
	type QuickBooksGrant,
	type QuickBooksStore,
	type QuickBooksTokens,
	quickBooksTokens,
} from "./quickbooks";
import { QUICKBOOKS, type QuickBooksConfig } from "./quickbooks-config";

const envelope = z.object({
	iv: z.string().regex(/^[a-f0-9]{24}$/),
	tag: z.string().regex(/^[a-f0-9]{32}$/),
	data: z.string().regex(/^[a-f0-9]+$/),
});

export function sealQuickBooksTokens(
	tokens: QuickBooksTokens,
	config: QuickBooksConfig,
): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv(
		"aes-256-gcm",
		Buffer.from(config.encryptionKey, "hex"),
		iv,
	);
	cipher.setAAD(Buffer.from(`${config.environment}:${config.realmId}`));
	const data = Buffer.concat([
		cipher.update(JSON.stringify(quickBooksTokens.parse(tokens)), "utf8"),
		cipher.final(),
	]);
	return JSON.stringify({
		iv: iv.toString("hex"),
		tag: cipher.getAuthTag().toString("hex"),
		data: data.toString("hex"),
	});
}

export function openQuickBooksTokens(
	value: string,
	config: QuickBooksConfig,
): QuickBooksTokens {
	try {
		const saved = envelope.parse(JSON.parse(value));
		const cipher = createDecipheriv(
			"aes-256-gcm",
			Buffer.from(config.encryptionKey, "hex"),
			Buffer.from(saved.iv, "hex"),
		);
		cipher.setAAD(Buffer.from(`${config.environment}:${config.realmId}`));
		cipher.setAuthTag(Buffer.from(saved.tag, "hex"));
		return quickBooksTokens.parse(
			JSON.parse(
				Buffer.concat([
					cipher.update(Buffer.from(saved.data, "hex")),
					cipher.final(),
				]).toString("utf8"),
			),
		);
	} catch {
		throw new Error(
			"QuickBooks credentials cannot be read. Owner re-enrollment is required.",
		);
	}
}

type StoredGrant = {
	realmId: string;
	environment: string;
	verifiedAt: Date | null;
	encryptedTokens: string;
};

export function quickBooksStore(
	db: Db,
	config: QuickBooksConfig,
): QuickBooksStore {
	const decode = (row: StoredGrant | null): QuickBooksGrant => {
		if (
			!row?.verifiedAt ||
			row.realmId !== config.realmId ||
			row.environment !== config.environment
		) {
			throw new Error(
				"QuickBooks enrollment is unverified or does not match this deployment.",
			);
		}
		return {
			realmId: row.realmId,
			environment: row.environment,
			verified: true,
			tokens: openQuickBooksTokens(row.encryptedTokens, config),
		};
	};
	return {
		async read() {
			return decode(
				await db.quickBooksConnection.findUnique({
					where: { id: QUICKBOOKS.connectionId },
				}),
			);
		},
		async rotate(accessToken, refresh) {
			return db.$transaction(
				async (tx) => {
					await tx.$queryRaw`SELECT "id" FROM "quickBooksConnection" WHERE "id" = ${QUICKBOOKS.connectionId} FOR UPDATE`;
					const current = decode(
						await tx.quickBooksConnection.findUnique({
							where: { id: QUICKBOOKS.connectionId },
						}),
					);
					if (current.tokens.accessToken !== accessToken) return current;
					const tokens = await refresh(current);
					await tx.quickBooksConnection.update({
						where: { id: QUICKBOOKS.connectionId },
						data: { encryptedTokens: sealQuickBooksTokens(tokens, config) },
					});
					return { ...current, tokens };
				},
				{
					timeout: QUICKBOOKS.transactionTimeoutMs,
					maxWait: QUICKBOOKS.lockWaitMs,
				},
			);
		},
	};
}
