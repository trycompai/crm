import { ActivityType, db, type Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { DISPATCH } from "./dispatch-config";
import { createField, listFields, writeField } from "./fields";
import { hostOf } from "./names";
import { scheduleTask } from "./tasks";

export const LEI_FIELD_LABEL = "LEI";
export const CIK_FIELD_LABEL = "CIK";
export const TICKER_FIELD_LABEL = "TICKER";
export const SIC_FIELD_LABEL = "SIC";

const IDENTIFIER_BRIEFS = {
	[LEI_FIELD_LABEL]:
		"The 20-character Legal Entity Identifier from the GLEIF register.",
	[CIK_FIELD_LABEL]:
		"The SEC Central Index Key of a company that files with EDGAR.",
	[TICKER_FIELD_LABEL]: "The stock ticker of a listed company.",
	[SIC_FIELD_LABEL]:
		"The four-digit Standard Industrial Classification code the SEC assigns.",
} as const;

type IdentifierLabel = keyof typeof IDENTIFIER_BRIEFS;

export type CompanySource = { label: string; url: string };

export type NewCompany = {
	name: string;
	website?: string | null;
	countryCode?: string | null;
	country?: string | null;
	city?: string | null;
	lei?: string | null;
	cik?: string | null;
	ticker?: string | null;
	sic?: string | null;
	stateCode?: string | null;
	source: CompanySource;
};

export type CreatedCompany = {
	created: boolean;
	id: string;
	name: string;
	domain: string | null;
	reason?: string;
};

function domainFrom(website: string | null | undefined): string | null {
	if (!website) return null;
	const host = hostOf(website);
	return host.includes(".") ? host : null;
}

async function existingCompany(
	name: string,
	domain: string | null,
	countryCode: string | null,
): Promise<{ id: string; name: string; domain: string | null } | null> {
	const select = { id: true, name: true, domain: true };

	if (domain) {
		const byDomain = await db.company.findFirst({
			where: { domain, archivedAt: null },
			select,
		});
		if (byDomain) return byDomain;
	}

	const where: Prisma.CompanyWhereInput = {
		name: { equals: name, mode: "insensitive" },
		archivedAt: null,
	};
	if (countryCode) where.countryCode = countryCode;

	return db.company.findFirst({ where, select });
}

async function authorId(): Promise<string | null> {
	const user = await db.user.findFirst({
		orderBy: { createdAt: "asc" },
		select: { id: true },
	});
	return user?.id ?? null;
}

async function recordIdentifier(
	companyId: string,
	label: IdentifierLabel,
	value: string,
): Promise<void> {
	const fields = await listFields("COMPANY");
	const existing = fields.find((field) => field.label.toUpperCase() === label);
	const key = existing
		? existing.key
		: await createField({
				entity: "COMPANY",
				label: label === TICKER_FIELD_LABEL ? "Ticker" : label,
				type: "TEXT",
				agentBrief: IDENTIFIER_BRIEFS[label],
			}).then((field) => ("created" in field ? null : field.key));

	if (key)
		await writeField({
			entity: "COMPANY",
			recordId: companyId,
			key,
			value,
		});
}

function identifiersOf(input: NewCompany): [IdentifierLabel, string][] {
	const pairs: [IdentifierLabel, string | null | undefined][] = [
		[LEI_FIELD_LABEL, input.lei?.trim().toUpperCase()],
		[CIK_FIELD_LABEL, input.cik?.trim().replace(/^0+(?=\d)/, "")],
		[TICKER_FIELD_LABEL, input.ticker?.trim().toUpperCase()],
		[SIC_FIELD_LABEL, input.sic?.trim()],
	];
	return pairs.flatMap(([label, value]) => (value ? [[label, value]] : []));
}

export async function createCompany(
	input: NewCompany,
): Promise<CreatedCompany> {
	const name = input.name.trim();
	const domain = domainFrom(input.website);
	const countryCode =
		input.countryCode?.trim().toUpperCase() || (input.cik ? "US" : null);

	const existing = await existingCompany(name, domain, countryCode);
	if (existing) {
		return {
			created: false,
			...existing,
			reason: domain
				? `${existing.name} already uses the domain ${domain}.`
				: `${existing.name} is already in the CRM.`,
		};
	}

	const occurredAt = new Date();
	const created = await db.$transaction(async (tx) => {
		const company = await tx.company.create({
			data: {
				name,
				domain,
				website: domain ? `https://${domain}` : null,
				countryCode,
				country: input.country?.trim() || null,
				city: input.city?.trim() || null,
				stateCode: input.stateCode?.trim().toUpperCase() || null,
			},
			select: { id: true, name: true, domain: true },
		});

		const payload: Prisma.InputJsonObject = {
			type: "company.created",
			record: { kind: "company", id: company.id },
			occurredAt: occurredAt.toISOString(),
			data: { name: company.name, domain: company.domain },
		};
		await tx.agentTask.create({
			data: {
				companyId: company.id,
				kind: "agent-event",
				reason: "company.created",
				payload,
				priority: PRIORITY.event,
				budget: 1,
				dueAt: occurredAt,
			},
		});

		return company;
	});

	const author = await authorId();
	if (author) {
		await db.activity.create({
			data: {
				type: ActivityType.ENRICHMENT,
				subject: `Added from ${input.source.label}`,
				body: [
					`${created.name} was added by the agent from ${input.source.label}.`,
					...identifiersOf(input).map(([label, value]) => `${label} ${value}.`),
					`Source: ${input.source.url}`,
				]
					.filter(Boolean)
					.join(" "),
				occurredAt,
				companyId: created.id,
				createdById: author,
				meta: {
					source: input.source.label,
					sourceUrl: input.source.url,
					agent: "sourcing",
				},
			},
			select: { id: true },
		});
	}

	for (const [label, value] of identifiersOf(input)) {
		await recordIdentifier(created.id, label, value);
	}

	await scheduleTask({
		companyId: created.id,
		kind: "brand",
		reason: "New company",
		dueAt: occurredAt,
		priority: PRIORITY.brand,
		budget: DISPATCH.newCompany.brandBudget,
	});
	await scheduleTask({
		companyId: created.id,
		kind: "company-profile",
		reason: "New company",
		dueAt: occurredAt,
		priority: PRIORITY.companyProfile,
		budget: DISPATCH.newCompany.profileBudget,
	});

	return { created: true, ...created };
}
