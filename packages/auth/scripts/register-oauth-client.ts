import { db } from "@crm/db";
import { z } from "zod";
import { auth } from "../src/auth";
import { OAUTH, OAUTH_SCOPES } from "../src/oauth-config";

function parseOptions(args: string[]) {
	const values = new Map<string, string[]>();
	const allowed = new Set([
		"--client-id",
		"--name",
		"--redirect-uri",
		"--post-logout-redirect-uri",
	]);

	for (let index = 0; index < args.length; index += 2) {
		const key = args[index];
		const value = args[index + 1];
		if (!key || !allowed.has(key) || !value) throw usageError();
		const entries = values.get(key) ?? [];
		entries.push(value);
		values.set(key, entries);
	}

	return z
		.object({
			clientId: z
				.string()
				.trim()
				.min(1)
				.max(200)
				.regex(/^[A-Za-z0-9._~-]+$/),
			name: z.string().trim().min(1).max(255),
			redirectUris: z.array(redirectUri).min(1),
			postLogoutRedirectUris: z.array(redirectUri),
		})
		.parse({
			clientId: singleValue(values, "--client-id"),
			name: singleValue(values, "--name"),
			redirectUris: values.get("--redirect-uri") ?? [],
			postLogoutRedirectUris: values.get("--post-logout-redirect-uri") ?? [],
		});
}

const redirectUri = z.string().superRefine((value, context) => {
	let uri: URL;

	try {
		uri = new URL(value);
	} catch {
		context.addIssue({ code: "custom", message: "Redirect URI is invalid." });
		return;
	}

	if (uri.hash) {
		context.addIssue({
			code: "custom",
			message: "Redirect URI contains a fragment.",
		});
	}

	if (value.includes("*")) {
		context.addIssue({
			code: "custom",
			message: "Redirect URI contains a wildcard.",
		});
	}

	if (uri.username || uri.password) {
		context.addIssue({
			code: "custom",
			message: "Redirect URI contains user information.",
		});
	}

	if (uri.protocol === "https:" && uri.hostname) return;

	if (
		uri.protocol === "http:" &&
		["127.0.0.1", "[::1]", "localhost"].includes(uri.hostname)
	) {
		return;
	}

	if (uri.protocol.slice(0, -1).includes(".") && !uri.host) return;

	context.addIssue({
		code: "custom",
		message:
			"Redirect URI must use HTTPS, loopback HTTP, or a reverse-domain private scheme.",
	});
});

function singleValue(values: Map<string, string[]>, key: string) {
	const entries = values.get(key);
	if (entries?.length !== 1) throw usageError();
	return entries[0];
}

function usageError() {
	return new Error(
		"Usage: bun run oauth:register-client --client-id <id> --name <name> --redirect-uri <uri> [--redirect-uri <uri>] [--post-logout-redirect-uri <uri>]",
	);
}

const options = parseOptions(process.argv.slice(2));

await auth.$context;

if (options.clientId === OAUTH.officialClient.id) {
	throw new Error(
		"The official OAuth client is managed by the reconciliation command.",
	);
}

const existing = await db.oauthClient.findUnique({
	where: { clientId: options.clientId },
	select: { clientId: true },
});

if (existing)
	throw new Error(`OAuth client ${options.clientId} already exists.`);

const now = new Date();

await db.$transaction(async (transaction) => {
	await transaction.oauthClient.create({
		data: {
			id: options.clientId,
			clientId: options.clientId,
			clientSecret: null,
			disabled: false,
			skipConsent: false,
			enableEndSession: true,
			scopes: [...OAUTH_SCOPES],
			clientCredentialsScopes: [],
			name: options.name,
			contacts: [],
			redirectUris: options.redirectUris,
			postLogoutRedirectUris: options.postLogoutRedirectUris,
			tokenEndpointAuthMethod: "none",
			applicationType: "native",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			requirePKCE: true,
			dpopBoundAccessTokens: false,
			createdAt: now,
			updatedAt: now,
		},
	});

	await transaction.oauthClientResource.create({
		data: {
			id: `oauth-client-resource:${options.clientId}`,
			clientId: options.clientId,
			resourceId: OAUTH.resource,
			createdAt: now,
		},
	});
});

await db.$disconnect();

process.stdout.write(`Registered OAuth client ${options.clientId}.\n`);
