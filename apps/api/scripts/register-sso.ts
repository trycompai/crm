import { parseArgs } from "node:util";
import {
	auth,
	ensureWorkspaceMembership,
	isWorkspaceEmail,
	ssoCallbackURL,
	WORKSPACE_ID,
	workspaceDomains,
} from "@crm/auth";
import { AUTH_COOKIE_PREFIX } from "@crm/auth/cookies";
import { db } from "@crm/db";
import { APIError } from "better-auth/api";

const COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session_token`;
const BOOTSTRAP_ID = "sso-bootstrap";
const BOOTSTRAP_EMAIL = "sso-bootstrap@localhost";
const BOOTSTRAP_TTL_MS = 5 * 60 * 1000;

const { values } = parseArgs({
	options: {
		provider: { type: "string" },
		issuer: { type: "string" },
		domain: { type: "string" },
		"client-id": { type: "string" },
		"client-secret": { type: "string" },
	},
	strict: true,
});

const providerId = values.provider;
const issuer = values.issuer;
const domain = values.domain;
const clientId = values["client-id"];
const clientSecret = values["client-secret"] ?? process.env.SSO_CLIENT_SECRET;

if (!providerId || !issuer || !domain || !clientId || !clientSecret) {
	console.error(
		"Usage: --provider <id> --issuer <url> --domain <email domain> --client-id <id> [--client-secret <secret> | SSO_CLIENT_SECRET=…]",
	);
	process.exit(2);
}

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
	throw new Error(
		"BETTER_AUTH_SECRET is not set — run this from the repo root.",
	);
}

if (workspaceDomains().length > 0 && !isWorkspaceEmail(`someone@${domain}`)) {
	console.warn(
		`Warning: "${domain}" is not covered by ALLOWED_SIGN_IN, so people from that domain would still be refused at sign-in. Add it to ALLOWED_SIGN_IN.`,
	);
}

async function signCookieValue(value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(value),
	);
	const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
	return encodeURIComponent(`${value}.${base64}`);
}

async function withBootstrapOwner<T>(
	run: (cookie: string) => Promise<T>,
): Promise<T> {
	await db.user.upsert({
		where: { id: BOOTSTRAP_ID },
		create: {
			id: BOOTSTRAP_ID,
			email: BOOTSTRAP_EMAIL,
			name: "SSO bootstrap",
			emailVerified: true,
			updatedAt: new Date(),
		},
		update: {},
	});

	try {
		const workspaceId = await ensureWorkspaceMembership(BOOTSTRAP_ID);
		if (workspaceId !== WORKSPACE_ID) {
			throw new Error("Could not enrol the bootstrap owner in the workspace.");
		}

		await db.member.update({
			where: {
				organizationId_userId: {
					organizationId: WORKSPACE_ID,
					userId: BOOTSTRAP_ID,
				},
			},
			data: { role: "owner" },
		});

		const token = `sso-bootstrap-${crypto.randomUUID()}`;
		await db.session.create({
			data: {
				id: token,
				token,
				userId: BOOTSTRAP_ID,
				activeOrganizationId: WORKSPACE_ID,
				expiresAt: new Date(Date.now() + BOOTSTRAP_TTL_MS),
				updatedAt: new Date(),
			},
		});

		return await run(`${COOKIE_NAME}=${await signCookieValue(token)}`);
	} finally {
		await db.$transaction([
			db.ssoProvider.updateMany({
				where: { userId: BOOTSTRAP_ID },
				data: { userId: null },
			}),
			db.user.delete({ where: { id: BOOTSTRAP_ID } }),
		]);
	}
}

try {
	const provider = await withBootstrapOwner((cookie) =>
		auth.api.registerSSOProvider({
			headers: new Headers({ cookie }),
			body: {
				providerId,
				issuer,
				domain,
				organizationId: WORKSPACE_ID,
				oidcConfig: { clientId, clientSecret, pkce: true },
			},
		}),
	);

	console.log(`Registered "${provider.providerId}" for ${provider.domain}.`);
	console.log("Redirect URI to allow at the identity provider:");
	console.log(`  ${ssoCallbackURL(provider.providerId)}`);
	console.log("It now appears on the sign-in page and on Settings → SSO.");
} catch (error) {
	const message =
		error instanceof APIError
			? JSON.stringify(error.body)
			: error instanceof Error
				? error.message
				: String(error);
	console.error(`Could not register the provider: ${message}`);
	process.exitCode = 1;
} finally {
	await db.$disconnect();
}
