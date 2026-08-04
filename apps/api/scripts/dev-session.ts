import { AUTH_COOKIE_PREFIX } from "@crm/auth/cookies";
import { db } from "@crm/db";

const COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session_token`;
const SESSION_DAYS = 7;

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

const token = `dev-session-${user.id}`;
const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

await db.session.upsert({
	where: { token },
	create: {
		id: token,
		token,
		userId: user.id,
		expiresAt,
		updatedAt: new Date(),
	},
	update: { expiresAt },
});

console.log(`${COOKIE_NAME}=${await signCookieValue(token)}`);

await db.$disconnect();
