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

const cookieValue = await signCookieValue(token);
const cookie = `${COOKIE_NAME}=${cookieValue}`;
const appUrl =
	process.env.APP_URL?.split(",")[0]?.trim() ?? "http://localhost:3000";

console.log(cookie);
console.log();
console.log(`Signed in as ${email}. To load the session in your browser:`);
console.log();
console.log(`  1. Open ${appUrl}`);
console.log(
	"  2. Open the browser console (View → Developer → JavaScript Console)",
);
console.log("  3. Paste this line and press Enter:");
console.log();
console.log(
	`     document.cookie = "${cookie}; path=/; max-age=${SESSION_DAYS * 24 * 60 * 60}"`,
);
console.log();
console.log("  4. Reload the page.");
console.log();
console.log(`The session expires in ${SESSION_DAYS} days.`);

await db.$disconnect();
