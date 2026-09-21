import "@crm/env/load";
import { QuickBooksClient } from "./quickbooks";
import { quickBooksConfig, quickBooksEnabled } from "./quickbooks-config";
import { quickBooksStore } from "./quickbooks-store";

export const quickBooksUnavailable = {
	ok: false,
	configured: false,
	reason:
		"QuickBooks is disabled. The owner must complete OAuth enrollment and verification before enabling it.",
} as const;

export async function quickBooksClient(): Promise<QuickBooksClient | null> {
	const config = quickBooksConfig();
	if (!quickBooksEnabled() || !config) return null;
	const { db } = await import("@crm/db");
	return new QuickBooksClient(config, quickBooksStore(db, config));
}
