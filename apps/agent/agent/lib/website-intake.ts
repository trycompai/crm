import { type Db, db, type Prisma } from "@crm/db";
import { z } from "zod";
import {
	INBOUND_CANDIDATE_REPLAY_TASK_KIND,
	websiteSourceDigest,
} from "./inbound-replay";
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
	updated: number;
	duplicates: number;
	tests: number;
	reason?: string;
};

type ImportedLead = "created" | "updated" | "duplicate";

export async function runWebsiteIntakeSync(
	database: Db = db,
	request: typeof fetch = fetch,
): Promise<WebsiteIntakeOutcome> {
	const key = process.env.LODE_WEBSITE_SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!key) {
		return {
			status: "skipped",
			imported: 0,
			updated: 0,
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
	let updated = 0;
	let duplicates = 0;
	let tests = 0;

	for (const candidate of input) {
		const row = leadSchema.parse(candidate);
		const result = await importLead(row, database);
		if (result === "duplicate") {
			duplicates += 1;
		} else if (result === "created") {
			imported += 1;
			if (isWebsiteTestLead(row)) tests += 1;
		} else {
			updated += 1;
		}
	}

	if (imported + updated > 0) {
		await scheduleTask({
			kind: INBOUND_CANDIDATE_REPLAY_TASK_KIND,
			reason:
				"Replay persisted website enquiries into reviewable candidate evidence",
			dueAt: new Date(),
			budget: 0,
		});
	}

	return { status: "synced", imported, updated, duplicates, tests };
}

async function importLead(
	row: WebsiteLead,
	database: Db,
): Promise<ImportedLead> {
	return database.$transaction(async (tx) => {
		await tx.$executeRaw`
			SELECT pg_advisory_xact_lock(hashtextextended(${`website-intake:${row.id}`}, 0))
		`;
		const existing = await tx.websiteEnquiry.findUnique({
			where: { externalId: row.id },
			select: {
				externalId: true,
				createdAtSource: true,
				name: true,
				email: true,
				company: true,
				country: true,
				biggestPain: true,
				notes: true,
				utm: true,
				source: true,
				sourcePath: true,
				qaTag: true,
				test: true,
			},
		});
		const data = websiteEnquiryData(row);
		if (
			existing &&
			websiteSourceDigest(existing) === websiteSourceDigest(data)
		) {
			return "duplicate";
		}
		if (existing) {
			await tx.websiteEnquiry.update({
				where: { externalId: row.id },
				data: { ...data, candidateId: null, receiptId: null },
			});
			return "updated";
		}
		await tx.websiteEnquiry.create({ data });
		return "created";
	});
}

function websiteEnquiryData(row: WebsiteLead) {
	return {
		externalId: row.id,
		createdAtSource: new Date(row.created_at),
		name: clean(row.name),
		email: row.email.trim().toLowerCase(),
		company: clean(row.company),
		country: clean(row.country),
		biggestPain: clean(row.biggest_pain),
		source: row.source,
		sourcePath: clean(row.source_path),
		utm: json(row.utm),
		qaTag: clean(row.qa_tag),
		notes: clean(row.notes),
		test: isWebsiteTestLead(row),
	};
}

function clean(value: string | null | undefined): string | null {
	const result = value?.trim();
	return result ? result : null;
}

function json(value: unknown): Prisma.InputJsonValue {
	if (value === undefined || value === null) return {};
	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

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
