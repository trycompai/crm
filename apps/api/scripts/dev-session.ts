import { appUrl } from "@crm/auth/env";
import { db } from "@crm/db";
import {
	DEV_SESSION_COOKIE_NAME,
	DEV_SESSION_DAYS,
	devSessionLoginUrl,
	signDevSessionCookieValue,
} from "../src/dev/dev-session.util";

if (process.env.NODE_ENV === "production") {
	throw new Error(
		"dev-session is a development helper and mints real sessions.",
	);
}

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
	throw new Error("BETTER_AUTH_SECRET is not set — run this from apps/api.");
}

const args = process.argv.slice(2);
const printUrl = args.includes("--url");
const email = args.find((arg) => arg !== "--url") ?? "dev@localhost";
const name = email.split("@")[0] ?? "Developer";

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
const expiresAt = new Date(Date.now() + DEV_SESSION_DAYS * 24 * 60 * 60 * 1000);

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

const signedValue = await signDevSessionCookieValue(token, secret);

console.log(`${DEV_SESSION_COOKIE_NAME}=${signedValue}`);

if (printUrl) {
	console.log(devSessionLoginUrl(appUrl, signedValue));
}

await db.$disconnect();
