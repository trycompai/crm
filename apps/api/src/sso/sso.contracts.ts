import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const ssoProviderListInput = listInput;

export const registerSsoProviderInput = z.object({
	providerId: z
		.string()
		.trim()
		.min(1)
		.max(64)
		.regex(
			/^[a-z0-9][a-z0-9-]*$/,
			"Use lower-case letters, numbers and hyphens.",
		),
	issuer: z.string().trim().url().max(512),
	domain: z.string().trim().min(1).max(255),
	clientId: z.string().trim().min(1).max(512),
	clientSecret: z.string().trim().min(1).max(1024),
});

export const deleteSsoProviderInput = z.object({
	providerId: z.string().trim().min(1).max(64),
});

export type SsoProviderListInput = z.infer<typeof ssoProviderListInput>;
export type RegisterSsoProviderInput = z.infer<typeof registerSsoProviderInput>;
export type DeleteSsoProviderInput = z.infer<typeof deleteSsoProviderInput>;
