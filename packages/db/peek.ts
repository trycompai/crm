import { db } from "./src/client";

console.log(
	"trackedDomain:",
	await db.trackedDomain.findMany({
		select: { host: true, scope: true, pageViews: true },
	}),
);
console.log(
	"trackedEvent hosts:",
	await db.trackedEvent.groupBy({ by: ["host"], _count: { _all: true } }),
);
console.log(
	"formSubmission:",
	await db.formSubmission.findMany({
		select: { host: true, email: true, filedAt: true },
	}),
);
console.log(
	"agentDefinitions:",
	await db.agentDefinition.findMany({
		select: { id: true, name: true, createdAt: true },
	}),
);
