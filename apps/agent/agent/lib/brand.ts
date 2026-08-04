import { db, EnrichmentStatus } from "@crm/db";
import { mirrorBrandImages } from "./brand-images";
import { brandToUpdate, filledFields, stillFillable } from "./brand-mapping";
import { brandByDomain, contextDevEnabled } from "./context-dev";

export type BrandResult = {
	enriched: boolean;
	filled?: string[];
	mirrored?: string[];
	reason?: string;
	retryable?: boolean;
};

export type Spend = (units?: number) => { ok: boolean; reason?: string };

export const FREE: Spend = () => ({ ok: true });

const COMPANY_FIELDS = {
	id: true,
	name: true,
	domain: true,
	description: true,
	logoUrl: true,
	logoDarkUrl: true,
	iconUrl: true,
	iconDarkUrl: true,
	iconTone: true,
	brandColor: true,
	industry: true,
	subIndustry: true,
	city: true,
	stateCode: true,
	country: true,
	countryCode: true,
	phone: true,
	email: true,
	linkedinUrl: true,
	twitterUrl: true,
	githubUrl: true,
	pricingUrl: true,
	careersUrl: true,
} as const;

export async function runBrand({
	companyId,
	fresh = false,
	spend = FREE,
}: {
	companyId: string;
	fresh?: boolean;
	spend?: Spend;
}): Promise<BrandResult> {
	const company = await db.company.findUnique({
		where: { id: companyId },
		select: COMPANY_FIELDS,
	});

	if (!company) return { enriched: false, reason: "No such company." };

	if (!(await contextDevEnabled())) {
		const reason =
			"Context.dev is not configured, so there is nowhere to look.";
		await settle(companyId, EnrichmentStatus.SKIPPED, reason);
		return { enriched: false, reason };
	}

	if (!company.domain) {
		await settle(companyId, EnrichmentStatus.SKIPPED, "No domain to look up.");
		return { enriched: false, reason: "No domain on this company." };
	}

	const charge = spend(2);
	if (!charge.ok) return { enriched: false, reason: charge.reason };

	await db.company.update({
		where: { id: companyId },
		data: {
			enrichmentStatus: EnrichmentStatus.RUNNING,
			enrichmentError: null,
		},
	});

	const result = await brandByDomain(company.domain, fresh ? 0 : undefined);

	if (result.outcome === "skipped") {
		await settle(companyId, EnrichmentStatus.SKIPPED, result.reason);
		return { enriched: false, reason: result.reason };
	}

	if (result.outcome === "failed") {
		await settle(companyId, EnrichmentStatus.FAILED, result.reason);
		return {
			enriched: false,
			reason: result.reason,
			retryable: result.retryable,
		};
	}

	const update = brandToUpdate(result.brand, snapshot(company));

	const { mirrored } = await mirrorBrandImages(companyId, update);

	const filled = await db.$transaction(async (tx) => {
		const current = await tx.company.findUnique({
			where: { id: companyId },
			select: COMPANY_FIELDS,
		});

		if (!current) return null;

		const data = stillFillable(update, snapshot(current));

		await tx.company.update({
			where: { id: companyId },
			data: {
				...data,
				enrichmentStatus: EnrichmentStatus.COMPLETE,
				enrichedAt: new Date(),
				enrichmentError: null,
			},
		});

		await tx.companyEnrichment.upsert({
			where: { companyId },
			create: { companyId, raw: result.raw as object },
			update: { raw: result.raw as object, fetchedAt: new Date() },
		});

		return filledFields(data);
	});

	if (!filled) return { enriched: false, reason: "No such company." };

	return {
		enriched: true,
		filled,
		mirrored: mirrored.filter((slot) => filled.includes(slot)),
	};
}

function snapshot<T extends { name: string; domain: string | null }>(
	company: T,
) {
	return { ...company, nameIsPlaceholder: company.name === company.domain };
}

export function brandOutcome(result: BrandResult): string {
	if (!result.enriched) return result.reason ?? "Nothing to fill.";

	const filled = result.filled ?? [];
	const mirrored = result.mirrored ?? [];

	if (filled.length === 0) {
		return "Everything Context.dev returned was already on the record.";
	}

	return `Filled ${filled.join(", ")}.${mirrored.length > 0 ? ` Copied ${mirrored.length} image(s) in-house.` : ""}`;
}

async function settle(
	companyId: string,
	status: EnrichmentStatus,
	error: string,
): Promise<void> {
	await db.company.update({
		where: { id: companyId },
		data: { enrichmentStatus: status, enrichmentError: error },
	});
}
