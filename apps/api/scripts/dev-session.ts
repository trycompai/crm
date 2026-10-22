import { AUTH_COOKIE_PREFIX } from "@crm/auth/cookies";
import { ensureWorkspaceMembership } from "@crm/auth/organization";
import { db } from "@crm/db";
import { DEV_SESSION } from "./dev-session-config";
import {
	createDevSessionResponse,
	localAppUrl,
	localLoginHost,
} from "./dev-session-http";

const COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session_token`;

if (process.env.NODE_ENV === "production") {
	throw new Error(
		"dev-session is a development helper and mints real sessions.",
	);
}

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
	throw new Error("BETTER_AUTH_SECRET is not set — run this from apps/api.");
}

const email = process.argv[2] ?? "dev@localhost";
const name = email.split("@")[0] ?? "Developer";
const appUrl = localAppUrl(process.env.APP_URL);
const loginHost = localLoginHost(appUrl);

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

const user = await db.user.upsert({
	where: { email },
	create: {
		id: `dev-${Buffer.from(email).toString("hex").slice(0, 20)}`,
		email,
		name,
		emailVerified: true,
		updatedAt: new Date(),
	},
	update: {},
});

const workspaceId = await ensureWorkspaceMembership(user.id);
if (!workspaceId) {
	throw new Error("Could not enrol the development user in the workspace.");
}

const token = `dev-session-${user.id}`;
const expiresAt = new Date(
	Date.now() + DEV_SESSION.cookie.days * 24 * 60 * 60 * 1000,
);

await db.session.upsert({
	where: { token },
	create: {
		id: token,
		token,
		userId: user.id,
		expiresAt,
		updatedAt: new Date(),
		activeOrganizationId: workspaceId,
	},
	update: { expiresAt, activeOrganizationId: workspaceId },
});

const cookieValue = await signCookieValue(token);
const loginPath = `/login/${crypto.randomUUID()}`;

await new Promise<void>((resolve) => {
	let finished = false;
	let server: ReturnType<typeof Bun.serve>;
	let timeout: ReturnType<typeof setTimeout> | undefined;

	const finish = () => {
		if (finished) return;
		finished = true;
		if (timeout) clearTimeout(timeout);
		server.stop();
		resolve();
	};

	server = Bun.serve({
		hostname: loginHost,
		port: 0,
		fetch(request) {
			if (new URL(request.url).pathname !== loginPath) {
				return new Response("Not found", { status: 404 });
			}

			setTimeout(finish, 0);
			return createDevSessionResponse({
				appUrl,
				cookieName: COOKIE_NAME,
				cookieValue,
			});
		},
	});

	timeout = setTimeout(finish, DEV_SESSION.login.timeoutMs);
	console.log("Open this link to sign in:");
	console.log(`http://${loginHost}:${server.port}${loginPath}`);
	console.log("The link expires in 10 minutes.");
});

await db.$disconnect();
