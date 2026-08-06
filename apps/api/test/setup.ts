import { afterAll } from "bun:test";
import { db } from "@crm/db";

afterAll(async () => {
	await db.$disconnect();
});
