import "@crm/env/load";

import path from "node:path";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
	schema: path.join("prisma", "schema.prisma"),
	migrations: {
		path: path.join("prisma", "migrations"),
		seed: "bun run prisma/seed.ts",
	},
	datasource: databaseUrl ? { url: databaseUrl } : undefined,
});
