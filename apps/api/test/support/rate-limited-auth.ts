import { apiKey } from "@better-auth/api-key";
import { db } from "@crm/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

export type RateLimitedAuthOptions = {
	maxRequests: number;
	timeWindowMs: number;
};

export function rateLimitedAuth(options: RateLimitedAuthOptions) {
	return betterAuth({
		secret: "test-secret-at-least-32-characters-long",
		baseURL: "http://localhost:3001",
		database: prismaAdapter(db, { provider: "postgresql" }),
		emailAndPassword: { enabled: false },
		plugins: [
			apiKey({
				enableSessionForAPIKeys: true,
				defaultKeyLength: 32,
				deferUpdates: true,
				rateLimit: {
					enabled: true,
					maxRequests: options.maxRequests,
					timeWindow: options.timeWindowMs,
				},
			}),
		],
	});
}

export type RateLimitedAuth = ReturnType<typeof rateLimitedAuth>;
