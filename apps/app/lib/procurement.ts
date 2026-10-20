import { db } from "@crm/db";

export async function ensureDataGearBusinessUnit() {
	const businessUnit = await db.businessUnit.upsert({
		where: { key: "data-gear" },
		update: { name: "Data-Gear", enabled: true },
		create: {
			key: "data-gear",
			name: "Data-Gear",
			description:
				"Data-Gear hardware, GPU/server procurement and supplier sourcing.",
			enabled: true,
		},
	});

	const existingPolicy = await db.procurementPricingPolicy.findFirst({
		where: { businessUnitId: businessUnit.id, isDefault: true },
		select: { id: true },
	});

	if (!existingPolicy) {
		await db.procurementPricingPolicy.create({
			data: {
				businessUnitId: businessUnit.id,
				name: "DataGear default",
				markupRate: 0.3,
				freshnessHours: 48,
				isDefault: true,
			},
		});
	}

	return businessUnit;
}
