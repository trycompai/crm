import { db, EnrichmentStatus, type Prisma } from "@crm/db";
import { mirrorBrandImages } from "./brand-images";
import { brandToUpdate, filledFields, stillFillable } from "./brand-mapping";
import { brandByDomain, contextDevEnabled } from "./context-dev";
import { type TaskLeaseScope, withTaskLease } from "./tasks";

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
	lease,
}: {
	companyId: string;
	fresh?: boolean;
	spend?: Spend;
	lease?: TaskLeaseScope;
}): Promise<BrandResult> {
	const company = await db.company.findUnique({
		where: { id: companyId },
		select: COMPANY_FIELDS,
	});

	if (!company) return { enriched: false, reason: "No such company." };

	if (!(await contextDevEnabled())) {
		const reason =
			"Context.dev is not configured, so there is nowhere to look.";
		return { enriched: false, reason };
	}

	if (!company.domain) {
		return { enriched: false, reason: "No domain on this company." };
	}

	const charge = spend(2);
	if (!charge.ok) return { enriched: false, reason: charge.reason };

	if (!(await markBrandRunning(companyId, lease))) return leaseLost();

	const result = await brandByDomain(company.domain, fresh ? 0 : undefined);

	if (result.outcome === "skipped") {
		if (
			!(await settle(companyId, EnrichmentStatus.SKIPPED, result.reason, lease))
		) {
			return leaseLost();
		}
		return { enriched: false, reason: result.reason };
	}

	if (result.outcome === "failed") {
		if (
			!(await settle(companyId, EnrichmentStatus.FAILED, result.reason, lease))
		) {
			return leaseLost();
		}
		return {
			enriched: false,
			reason: result.reason,
			retryable: result.retryable,
		};
	}

	const update = brandToUpdate(result.brand, snapshot(company));

	const { mirrored } = await mirrorBrandImages(companyId, update);

	const write = async (tx: Prisma.TransactionClient) => {
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
	};
	const committed = lease
		? await withTaskLease({ ...lease, companyId }, write)
		: { owned: true as const, value: await db.$transaction(write) };

	if (!committed.owned) return leaseLost();
	const filled = committed.value;

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
	lease?: TaskLeaseScope,
): Promise<boolean> {
	const write = async (client: Prisma.TransactionClient) => {
		await client.company.updateMany({
			where: { id: companyId, enrichmentStatus: EnrichmentStatus.RUNNING },
			data: { enrichmentStatus: status, enrichmentError: error },
		});
	};

	if (lease) {
		return (await withTaskLease({ ...lease, companyId }, write)).owned;
	}

	await db.$transaction(write);
	return true;
}

async function markBrandRunning(
	companyId: string,
	lease?: TaskLeaseScope,
): Promise<boolean> {
	const write = async (client: Prisma.TransactionClient) => {
		const { count } = await client.company.updateMany({
			where: { id: companyId },
			data: {
				enrichmentStatus: EnrichmentStatus.RUNNING,
				enrichmentError: null,
			},
		});
		return count === 1;
	};

	if (lease) {
		const result = await withTaskLease({ ...lease, companyId }, write);
		return result.owned && result.value;
	}

	return db.$transaction(write);
}

function leaseLost(): BrandResult {
	return {
		enriched: false,
		reason: "The task lease is no longer active.",
		retryable: true,
	};
}
