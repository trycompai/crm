import { db } from "../src/index";

type ArchiveRow = {
	scan_id: string;
	mailbox: string;
	messages_scanned: number;
	next_scan_index: number;
	payload: unknown;
	payload_hash: string;
	archived_at: Date;
	updated_at: Date;
};

type Finding = {
	company?: string | null;
	contact?: string | null;
	email?: string | null;
	category?: string | null;
	subject?: string | null;
	notes?: string | null;
	priority?: string | null;
};

type ContactRow = {
	id: string;
	firstName: string;
	lastName: string | null;
	email: string | null;
	companyId: string | null;
};

type CompanyRow = {
	id: string;
	name: string;
	domain: string | null;
	email: string | null;
};

type SourceRow = {
	sourceId: string;
};

type BusinessUnitRow = {
	id: string;
	key: string;
	name: string;
};

const DEFAULT_SCAN_ID = "outlook:danny@lumenstechnology.com:0-4799";

function arg(name: string): string | undefined {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function normalizeName(value: string | null | undefined): string {
	return (value ?? "")
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|company|co)\b/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function aliases(value: string | null | undefined): string[] {
	return (value ?? "")
		.split(/[\/|]/)
		.map((part) => normalizeName(part))
		.filter(Boolean);
}

function emailDomain(email: string | null | undefined): string | null {
	const value = (email ?? "").trim().toLowerCase();
	const at = value.lastIndexOf("@");
	if (at < 1 || at === value.length - 1) return null;
	return value.slice(at + 1);
}

const GENERIC_OR_RELAY_DOMAINS = new Set([
	"gmail.com",
	"googlemail.com",
	"yahoo.com",
	"outlook.com",
	"hotmail.com",
	"icloud.com",
	"me.com",
	"live.com",
	"msn.com",
	"atlassian.net",
	"theonevalley.com",
	"upperweststrategies.com",
]);

function suggestedDomain(finding: Finding): string | null {
	const domain = emailDomain(finding.email);
	if (!domain || GENERIC_OR_RELAY_DOMAINS.has(domain)) return null;

	const hostToken = domain.split(".")[0]?.replace(/[^a-z0-9]/g, "") ?? "";
	const companyTokens = aliases(finding.company).map((value) =>
		value.replace(/[^a-z0-9]/g, ""),
	);

	return companyTokens.some(
		(token) =>
			token.length >= 3 &&
			(hostToken.includes(token) || token.includes(hostToken)),
	)
		? domain
		: null;
}

function dealCandidate(finding: Finding): { candidate: boolean; reason: string | null } {
	const category = (finding.category ?? "").toLowerCase();

	if (
		category.startsWith("customer/") ||
		category.includes("opportunity") ||
		category.startsWith("potential-client/")
	) {
		return {
			candidate: true,
			reason: `category=${finding.category ?? "unknown"}`,
		};
	}

	return { candidate: false, reason: null };
}

function sourceId(scanId: string, index: number): string {
	return `${scanId}:finding:${index}`;
}

function safeJson(value: unknown): string {
	return JSON.stringify(
		value,
		(_key, item) => (item instanceof Date ? item.toISOString() : item),
		2,
	);
}

async function main() {
	if (process.argv.includes("--apply")) {
		throw new Error(
			"This script is intentionally read-only. --apply is not supported. Review the dry run first.",
		);
	}

	const scanId = arg("scan-id") ?? DEFAULT_SCAN_ID;

	const archives = await db.$queryRaw<ArchiveRow[]>`
		SELECT
			scan_id,
			mailbox,
			messages_scanned,
			next_scan_index,
			payload,
			payload_hash,
			archived_at,
			updated_at
		FROM outlook_scan_archive
		WHERE scan_id = ${scanId}
		LIMIT 1
	`;

	const archive = archives[0];
	if (!archive) {
		throw new Error(`No outlook_scan_archive row found for ${scanId}`);
	}

	const payload =
		archive.payload && typeof archive.payload === "object"
			? (archive.payload as Record<string, unknown>)
			: {};

	const findings = Array.isArray(payload.findings)
		? (payload.findings as Finding[])
		: [];

	if (findings.length === 0) {
		throw new Error(`Archive ${scanId} contains no findings`);
	}

	const [contacts, companies, businessUnits, existingSources] = await Promise.all([
		db.$queryRaw<ContactRow[]>`
			SELECT
				id,
				"firstName",
				"lastName",
				LOWER(email) AS email,
				"companyId"
			FROM contact
			WHERE "archivedAt" IS NULL
			  AND email IS NOT NULL
		`,
		db.$queryRaw<CompanyRow[]>`
			SELECT id, name, LOWER(domain) AS domain, LOWER(email) AS email
			FROM company
			WHERE "archivedAt" IS NULL
		`,
		db.$queryRaw<BusinessUnitRow[]>`
			SELECT id, key, name
			FROM business_unit
			WHERE enabled = TRUE
			ORDER BY key
		`,
		db.$queryRaw<SourceRow[]>`
			SELECT "sourceId"
			FROM source_record
			WHERE "sourceSystem" = 'outlook-scan'
			  AND "sourceType" = 'finding'
		`,
	]);

	const contactsByEmail = new Map(
		contacts
			.filter((row) => row.email)
			.map((row) => [row.email!.toLowerCase(), row]),
	);
	const companiesById = new Map(companies.map((row) => [row.id, row]));

	const companiesByDomain = new Map<string, CompanyRow[]>();
	const companiesByName = new Map<string, CompanyRow[]>();

	for (const company of companies) {
		if (company.domain) {
			const bucket = companiesByDomain.get(company.domain) ?? [];
			bucket.push(company);
			companiesByDomain.set(company.domain, bucket);
		}

		for (const alias of aliases(company.name)) {
			const bucket = companiesByName.get(alias) ?? [];
			bucket.push(company);
			companiesByName.set(alias, bucket);
		}
	}

	const existingSourceIds = new Set(existingSources.map((row) => row.sourceId));

	const lumensBusinessUnit =
		businessUnits.find((unit) => unit.key.toLowerCase() === "lumens") ??
		businessUnits.find((unit) => normalizeName(unit.name).includes("lumens")) ??
		null;

	const rows = findings.map((finding, index) => {
		const email = finding.email?.trim().toLowerCase() || null;
		const contact = email ? contactsByEmail.get(email) ?? null : null;

		let companyMatch: CompanyRow | null = null;
		let companyMatchMethod: string | null = null;
		let ambiguousCompanyIds: string[] = [];

		if (contact?.companyId) {
			companyMatch = companiesById.get(contact.companyId) ?? null;
			if (companyMatch) companyMatchMethod = "contact-company";
		}

		if (!companyMatch) {
			const domain = emailDomain(email);
			const byDomain = domain ? companiesByDomain.get(domain) ?? [] : [];
			if (byDomain.length === 1) {
				companyMatch = byDomain[0] ?? null;
				companyMatchMethod = "email-domain";
			} else if (byDomain.length > 1) {
				ambiguousCompanyIds = byDomain.map((company) => company.id);
			}
		}

		if (!companyMatch && ambiguousCompanyIds.length === 0) {
			const byName = new Map<string, CompanyRow>();
			for (const alias of aliases(finding.company)) {
				for (const company of companiesByName.get(alias) ?? []) {
					byName.set(company.id, company);
				}
			}

			if (byName.size === 1) {
				companyMatch = [...byName.values()][0] ?? null;
				companyMatchMethod = "normalized-name";
			} else if (byName.size > 1) {
				ambiguousCompanyIds = [...byName.keys()];
			}
		}

		const source = sourceId(scanId, index);
		const deal = dealCandidate(finding);

		return {
			index,
			sourceId: source,
			sourceRecord: existingSourceIds.has(source)
				? { action: "existing" }
				: {
						action: lumensBusinessUnit ? "propose-create" : "blocked",
						businessUnitId: lumensBusinessUnit?.id ?? null,
						businessUnitKey: lumensBusinessUnit?.key ?? null,
					},
			finding,
			contact: contact
				? {
						action: "match",
						id: contact.id,
						email: contact.email,
					}
				: email
					? {
							action: "propose-create",
							email,
							name: finding.contact ?? null,
						}
					: { action: "none" },
			company: companyMatch
				? {
						action: "match",
						id: companyMatch.id,
						name: companyMatch.name,
						domain: companyMatch.domain,
						method: companyMatchMethod,
					}
				: ambiguousCompanyIds.length > 0
					? {
							action: "ambiguous",
							candidateIds: ambiguousCompanyIds,
						}
					: finding.company
						? {
								action: "propose-create",
								name: finding.company,
								suggestedDomain: suggestedDomain(finding),
							}
						: { action: "none" },
			dealCandidate: deal,
		};
	});

	const count = (predicate: (row: (typeof rows)[number]) => boolean) =>
		rows.filter(predicate).length;

	const summary = {
		mode: "DRY_RUN_READ_ONLY",
		scan: {
			scanId: archive.scan_id,
			mailbox: archive.mailbox,
			messagesScanned: archive.messages_scanned,
			nextScanIndex: archive.next_scan_index,
			findings: findings.length,
			payloadHash: archive.payload_hash,
		},
		businessUnit: lumensBusinessUnit
			? {
					id: lumensBusinessUnit.id,
					key: lumensBusinessUnit.key,
					name: lumensBusinessUnit.name,
				}
			: null,
		availableBusinessUnits: businessUnits,
		counts: {
			sourceRecordsAlreadyPresent: count(
				(row) => row.sourceRecord.action === "existing",
			),
			sourceRecordsProposed: count(
				(row) => row.sourceRecord.action === "propose-create",
			),
			sourceRecordsBlocked: count(
				(row) => row.sourceRecord.action === "blocked",
			),
			contactsMatched: count((row) => row.contact.action === "match"),
			contactsProposed: count(
				(row) => row.contact.action === "propose-create",
			),
			companiesMatched: count((row) => row.company.action === "match"),
			companiesProposed: count(
				(row) => row.company.action === "propose-create",
			),
			companiesAmbiguous: count(
				(row) => row.company.action === "ambiguous",
			),
			dealCandidates: count((row) => row.dealCandidate.candidate),
		},
		rows,
	};

	console.log(safeJson(summary));
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.$disconnect();
	});
