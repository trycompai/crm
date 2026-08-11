import { ActivityType, type Db, db, type Prisma, RecordSource } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { z } from "zod";
import { scheduleTask } from "./tasks";

const PAGE_SIZE = 200;
const OVERLAP_MS = 5 * 60_000;
const DEFAULT_SUPABASE_URL = "https://ctybpybafpzpxmdxuroo.supabase.co";
const DEFAULT_TABLE = "marketing_leads";

const leadSchema = z.object({
	id: z.string().min(1),
	created_at: z.string().datetime({ offset: true }),
	name: z.string().nullable().optional(),
	email: z.string().email(),
	company: z.string().nullable().optional(),
	country: z.string().nullable().optional(),
	biggest_pain: z.string().nullable().optional(),
	source: z.string().min(1).default("website"),
	source_path: z.string().nullable().optional(),
	utm: z.unknown().default({}),
	qa_tag: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
});

export type WebsiteLead = z.infer<typeof leadSchema>;

export type WebsiteIntakeOutcome = {
	status: "synced" | "skipped";
	imported: number;
	duplicates: number;
	tests: number;
	reason?: string;
};

type ImportedLead = {
	created: boolean;
	test: boolean;
	companyId: string | null;
	contactId: string | null;
	companyNeedsEnrichment: boolean;
	contactNeedsEnrichment: boolean;
};

export async function runWebsiteIntakeSync(
	database: Db = db,
	request: typeof fetch = fetch,
): Promise<WebsiteIntakeOutcome> {
	const key = process.env.LODE_WEBSITE_SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!key) {
		return {
			status: "skipped",
			imported: 0,
			duplicates: 0,
			tests: 0,
			reason: "Website lead access is not configured.",
		};
	}

	const base =
		process.env.LODE_WEBSITE_SUPABASE_URL?.trim() ?? DEFAULT_SUPABASE_URL;
	const table = process.env.LODE_WEBSITE_LEADS_TABLE?.trim() ?? DEFAULT_TABLE;
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
		throw new Error("LODE_WEBSITE_LEADS_TABLE is not a valid table name.");
	}

	const latest = await database.websiteEnquiry.findFirst({
		orderBy: { createdAtSource: "desc" },
		select: { createdAtSource: true },
	});
	const after = latest
		? new Date(latest.createdAtSource.getTime() - OVERLAP_MS)
		: null;
	const rows: WebsiteLead[] = [];

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const url = new URL(`/rest/v1/${table}`, base);
		url.searchParams.set(
			"select",
			"id,created_at,name,email,company,country,biggest_pain,source,source_path,utm,qa_tag,notes",
		);
		url.searchParams.set("order", "created_at.asc");
		url.searchParams.set("limit", String(PAGE_SIZE));
		url.searchParams.set("offset", String(offset));
		if (after) url.searchParams.set("created_at", `gte.${after.toISOString()}`);

		const response = await request(url, {
			headers: { apikey: key, authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) {
			throw new Error(`Website lead feed returned ${response.status}.`);
		}

		const page = z.array(leadSchema).parse(await response.json());
		rows.push(...page);
		if (page.length < PAGE_SIZE) break;
	}

	return importWebsiteLeads(rows, database);
}

export async function importWebsiteLeads(
	input: readonly WebsiteLead[],
	database: Db = db,
): Promise<WebsiteIntakeOutcome> {
	let imported = 0;
	let duplicates = 0;
	let tests = 0;

	for (const candidate of input) {
		const row = leadSchema.parse(candidate);
		const result = await importLead(row, database);
		if (!result.created) {
			duplicates += 1;
		} else {
			imported += 1;
			if (result.test) tests += 1;
		}

		const now = new Date();
		if (result.companyNeedsEnrichment && result.companyId) {
			await Promise.all([
				scheduleTask({
					companyId: result.companyId,
					kind: "brand",
					reason: "Company requested access on the Lode website",
					dueAt: now,
					priority: PRIORITY.brand,
					budget: 2,
				}),
				scheduleTask({
					companyId: result.companyId,
					kind: "company-profile",
					reason: "Enrich a company that requested access on the Lode website",
					dueAt: now,
					priority: PRIORITY.requested,
					budget: 8,
				}),
			]);
		}
		if (result.contactNeedsEnrichment && result.contactId) {
			await scheduleTask({
				contactId: result.contactId,
				kind: "identify",
				reason: "Enrich a person who requested access on the Lode website",
				dueAt: now,
				priority: PRIORITY.requested,
				budget: 8,
			});
		}
	}

	return { status: "synced", imported, duplicates, tests };
}

async function importLead(
	row: WebsiteLead,
	database: Db,
): Promise<ImportedLead> {
	return database.$transaction(async (tx) => {
		const existing = await tx.websiteEnquiry.findUnique({
			where: { externalId: row.id },
			select: {
				companyId: true,
				contactId: true,
				companyRecord: { select: { enrichmentStatus: true } },
				contact: { select: { enrichmentStatus: true } },
			},
		});
		if (existing) {
			return {
				created: false,
				test: Boolean(row.qa_tag),
				companyId: existing.companyId,
				contactId: existing.contactId,
				companyNeedsEnrichment:
					existing.companyRecord?.enrichmentStatus !== "COMPLETE",
				contactNeedsEnrichment:
					existing.contact?.enrichmentStatus !== "COMPLETE",
			};
		}

		const email = row.email.trim().toLowerCase();
		const test = isWebsiteTestLead(row);
		const suppressed = await isSuppressed(email, tx);
		let companyId: string | null = null;
		let contactId: string | null = null;
		let companyNeedsEnrichment = false;
		let contactNeedsEnrichment = false;

		if (!test && !suppressed) {
			const owner = await tx.user.findFirst({
				orderBy: { createdAt: "asc" },
				select: { id: true },
			});
			const existingContact = await tx.contact.findFirst({
				where: { email: { equals: email, mode: "insensitive" } },
				select: {
					id: true,
					companyId: true,
					enrichmentStatus: true,
					company: { select: { enrichmentStatus: true } },
				},
			});

			contactId = existingContact?.id ?? null;
			companyId = existingContact?.companyId ?? null;
			contactNeedsEnrichment =
				Boolean(existingContact) &&
				existingContact?.enrichmentStatus !== "COMPLETE";
			companyNeedsEnrichment =
				Boolean(existingContact?.company) &&
				existingContact?.company?.enrichmentStatus !== "COMPLETE";
			if (!companyId) {
				const domain = workDomain(email);
				const company = domain
					? await tx.company.findUnique({
							where: { domain },
							select: { id: true, enrichmentStatus: true },
						})
					: row.company
						? await tx.company.findFirst({
								where: {
									name: { equals: row.company.trim(), mode: "insensitive" },
								},
								select: { id: true, enrichmentStatus: true },
							})
						: null;

				if (company) {
					companyId = company.id;
					companyNeedsEnrichment = company.enrichmentStatus !== "COMPLETE";
				} else if (row.company?.trim()) {
					const created = await tx.company.create({
						data: {
							name: row.company.trim(),
							domain,
							website: domain ? `https://${domain}` : null,
							country: clean(row.country),
							ownerId: owner?.id,
							source: RecordSource.WEBSITE,
						},
						select: { id: true },
					});
					companyId = created.id;
					companyNeedsEnrichment = true;
				}
			}

			if (!contactId) {
				const name = splitName(row.name, email);
				const contact = await tx.contact.create({
					data: {
						firstName: name.firstName,
						lastName: name.lastName,
						email,
						companyId,
						ownerId: owner?.id,
						source: RecordSource.WEBSITE,
					},
					select: { id: true },
				});
				contactId = contact.id;
				contactNeedsEnrichment = true;
			} else if (companyId && !existingContact?.companyId) {
				await tx.contact.update({
					where: { id: contactId },
					data: { companyId },
				});
			}

			if (owner) {
				await tx.activity.create({
					data: {
						type: ActivityType.NOTE,
						subject: "Website access request",
						body: enquiryBody(row),
						occurredAt: new Date(row.created_at),
						companyId,
						contactId,
						createdById: owner.id,
						meta: {
							source: "website",
							externalId: row.id,
							sourcePath: row.source_path ?? null,
						} satisfies Prisma.InputJsonObject,
					},
				});
			}
		}

		await tx.websiteEnquiry.create({
			data: {
				externalId: row.id,
				createdAtSource: new Date(row.created_at),
				name: clean(row.name),
				email,
				company: clean(row.company),
				country: clean(row.country),
				biggestPain: clean(row.biggest_pain),
				source: row.source,
				sourcePath: clean(row.source_path),
				utm: json(row.utm),
				qaTag: clean(row.qa_tag),
				notes: clean(row.notes),
				test,
				companyId,
				contactId,
			},
		});

		return {
			created: true,
			test,
			companyId,
			contactId,
			companyNeedsEnrichment,
			contactNeedsEnrichment,
		};
	});
}

function clean(value: string | null | undefined): string | null {
	const result = value?.trim();
	return result ? result : null;
}

function splitName(
	value: string | null | undefined,
	email: string,
): { firstName: string; lastName: string | null } {
	const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];
	if (parts.length === 0) {
		return {
			firstName: email.split("@")[0] || "Website enquiry",
			lastName: null,
		};
	}
	return {
		firstName: parts[0] ?? "Website enquiry",
		lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
	};
}

function workDomain(email: string): string | null {
	const domain = email.split("@")[1]?.toLowerCase() ?? null;
	if (!domain) return null;
	return FREE_MAIL.has(domain) ? null : domain;
}

async function isSuppressed(
	email: string,
	database: Prisma.TransactionClient,
): Promise<boolean> {
	const domain = email.split("@")[1]?.toLowerCase();
	const [contact, domainRow] = await Promise.all([
		database.suppressedContact.findUnique({ where: { email } }),
		domain ? database.suppressedDomain.findUnique({ where: { domain } }) : null,
	]);
	return Boolean(contact || domainRow);
}

function enquiryBody(row: WebsiteLead): string {
	return [
		clean(row.country) ? `Country: ${clean(row.country)}` : null,
		clean(row.biggest_pain) ? `Biggest pain: ${clean(row.biggest_pain)}` : null,
	]
		.filter((value): value is string => Boolean(value))
		.join("\n");
}

function json(value: unknown): Prisma.InputJsonValue {
	if (value === undefined || value === null) return {};
	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const FREE_MAIL = new Set([
	"gmail.com",
	"googlemail.com",
	"hotmail.com",
	"icloud.com",
	"live.com",
	"outlook.com",
	"proton.me",
	"protonmail.com",
	"yahoo.com",
]);

const RESERVED_TEST_DOMAINS = new Set([
	"example.com",
	"example.net",
	"example.org",
]);

export function isWebsiteTestLead(row: WebsiteLead): boolean {
	if (row.qa_tag?.trim()) return true;
	const domain = row.email.trim().toLowerCase().split("@")[1] ?? "";
	if (domain.endsWith(".invalid") || RESERVED_TEST_DOMAINS.has(domain)) {
		return true;
	}

	const labels = [row.name, row.company]
		.filter((value): value is string => Boolean(value?.trim()))
		.join(" ");
	return /\b(?:qa|smoke|probe)\b/i.test(labels);
}
