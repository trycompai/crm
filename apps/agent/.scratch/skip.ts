import { db, EnrichmentStatus } from "@crm/db";
import { settle } from "../agent/lib/enrichment";

const company = await db.company.create({
	data: {
		name: "Settle Probe",
		domain: "settle-probe.test",
		enrichmentStatus: EnrichmentStatus.PENDING,
	},
	select: { id: true, enrichmentStatus: true },
});
console.log("created            ", company.enrichmentStatus);

// Exactly what runBrand does when there is no key: settle before anything marks it RUNNING.
await settle({ companyId: company.id }, EnrichmentStatus.SKIPPED, "no key");

const after = await db.company.findUnique({
	where: { id: company.id },
	select: { enrichmentStatus: true },
});
console.log("after settle(SKIP) ", after?.enrichmentStatus);
console.log(
	"swept again?       ",
	after?.enrichmentStatus === "PENDING"
		? "YES — sweep re-queues PENDING"
		: "NO — stuck",
);

await db.company.delete({ where: { id: company.id } });
await db.$disconnect();
