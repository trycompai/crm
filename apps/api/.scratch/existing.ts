import "@crm/env/load";
import { db } from "@crm/db";
import { readContextDevKey } from "@crm/db/settings";

// Simulate an existing deployment: key in the environment, nothing in the row.
await db.appSetting.upsert({
	where: { id: "app" },
	create: { id: "app", contextDevApiKey: null },
	update: { contextDevApiKey: null },
});

console.log(
	"env var set?      ",
	Boolean(process.env.CONTEXT_DEV_API_KEY?.trim()),
);
console.log("key the app finds ", await readContextDevKey(db));
console.log(
	"=> researchKey.configured would be false, so the proxy gates everyone.",
);

await db.$disconnect();
