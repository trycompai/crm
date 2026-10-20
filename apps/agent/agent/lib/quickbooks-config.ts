import { z } from "zod";

export const QUICKBOOKS = {
	tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
	hosts: {
		sandbox: "https://sandbox-quickbooks.api.intuit.com",
		production: "https://quickbooks.api.intuit.com",
	},
	requestTimeoutMs: 10_000,
	transactionTimeoutMs: 20_000,
	lockWaitMs: 5_000,
	connectionId: "workspace",
} as const;

export const quickBooksConfigSchema = z.object({
	clientId: z.string().trim().min(1),
	clientSecret: z.string().trim().min(1),
	realmId: z.string().regex(/^\d+$/),
	environment: z.enum(["sandbox", "production"]),
	encryptionKey: z.string().regex(/^[a-fA-F0-9]{64}$/),
});

export type QuickBooksConfig = z.infer<typeof quickBooksConfigSchema>;

export function quickBooksConfig(): QuickBooksConfig | null {
	const parsed = quickBooksConfigSchema.safeParse({
		clientId: process.env.QUICKBOOKS_CLIENT_ID,
		clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
		realmId: process.env.QUICKBOOKS_REALM_ID,
		environment: process.env.QUICKBOOKS_ENVIRONMENT,
		encryptionKey: process.env.QUICKBOOKS_ENCRYPTION_KEY,
	});
	return parsed.success ? parsed.data : null;
}

export function quickBooksEnabled(): boolean {
	return (
		process.env.QUICKBOOKS_ENABLED === "true" && quickBooksConfig() !== null
	);
}
