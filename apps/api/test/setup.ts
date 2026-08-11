import { afterAll } from "bun:test";

function fallbackEnv(key: string, value: string) {
	if (!process.env[key]) process.env[key] = value;
}

fallbackEnv("GOOGLE_CLIENT_ID", "test-google-client-id");
fallbackEnv("GOOGLE_CLIENT_SECRET", "test-google-client-secret");

afterAll(async () => {
	if (!process.env.DATABASE_URL) return;
	const { db } = await import("@crm/db");
	await db.$disconnect();
});
