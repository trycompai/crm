import { db } from "@crm/db";
import { ensureOfficialOAuthClient } from "../src/oauth-client";

await ensureOfficialOAuthClient();
await db.$disconnect();

process.stdout.write("Official OAuth client reconciled.\n");
