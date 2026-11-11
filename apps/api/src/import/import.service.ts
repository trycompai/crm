import { type Db, RecordSource } from "@crm/db";
import { BadRequestException, Injectable } from "@nestjs/common";
import { domainFromEmail, normalizeDomain } from "../companies/domain";
import { normalizeEmail } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { FieldsService } from "../fields/fields.service";
import type {
	ImportCommitOutput,
	ImportPreviewOutput,
	ImportRequestInput,
	ImportRowInput,
} from "./import.contracts";

const ALLOWED_HEADERS = new Set([
	"company_name",
	"company_domain",
	"industry",
	"country",
	"country_code",
	"first_name",
	"last_name",
	"email",
	"title",
	"linkedin_url",
	"account_type",
	"lead_source",
	"idioma",
	"evento_de_origem",
	"mensagem_gancho",
	"abordagem_sugerida",
]);

type CompanyAction = "create" | "update" | "reuse-pending";
type ContactAction = "create" | "update" | "reuse-pending";

type CompanyPlan =
	| { action: "skip" }
	| {
			action: CompanyAction;
			existingId: string | null;
			domain: string | null;
			name: string;
			industry: string | null;
			country: string | null;
			countryCode: string | null;
			fields: Record<string, string>;
	  };

type ContactPlan =
	| { action: "skip" }
	| {
			action: ContactAction;
			existingId: string | null;
			email: string | null;
			firstName: string;
			lastName: string | null;
			title: string | null;
			linkedinUrl: string | null;
			fields: Record<string, string>;
	  };

type RowPlan = {
	rowIndex: number;
	company: CompanyPlan;
	contact: ContactPlan;
	error: string | null;
};

type EvaluatedImport = {
	unrecognizedHeaders: string[];
	rows: RowPlan[];
};

function cell(row: ImportRowInput, key: string): string | undefined {
	const value = row[key];
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

@Injectable()
export class ImportService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly fields: FieldsService,
	) {}

	async preview(input: ImportRequestInput): Promise<ImportPreviewOutput> {
		const evaluated = await this.evaluate(input.rows);
		return this.summarize(evaluated);
	}

	async commit(input: ImportRequestInput): Promise<ImportCommitOutput> {
		const evaluated = await this.evaluate(input.rows);

		const hasRowErrors = evaluated.rows.some((row) => row.error !== null);
		if (hasRowErrors || evaluated.unrecognizedHeaders.length > 0) {
			throw new BadRequestException(
				"Corrija os erros apontados pelo dry-run antes de confirmar a importação.",
			);
		}

		let companiesCreated = 0;
		let companiesUpdated = 0;
		let contactsCreated = 0;
		let contactsUpdated = 0;

		const companyIdByDomain = new Map<string, string>();
		const contactIdByEmail = new Map<string, string>();

		for (const row of evaluated.rows) {
			await this.db.$transaction(async (tx) => {
				let companyId: string | null = null;

				if (row.company.action !== "skip") {
					const plan = row.company;

					if (plan.action === "update" && plan.existingId) {
						companyId = plan.existingId;
						await tx.company.update({
							where: { id: companyId },
							data: {
								industry: plan.industry ?? undefined,
								country: plan.country ?? undefined,
								countryCode: plan.countryCode ?? undefined,
							},
						});
						companiesUpdated += 1;
					} else if (
						plan.action === "reuse-pending" &&
						plan.domain &&
						companyIdByDomain.has(plan.domain)
					) {
						companyId = companyIdByDomain.get(plan.domain) ?? null;
					} else {
						const created = await tx.company.create({
							data: {
								name: plan.name,
								domain: plan.domain,
								industry: plan.industry,
								country: plan.country,
								countryCode: plan.countryCode,
								source: RecordSource.IMPORT,
							},
							select: { id: true },
						});
						companyId = created.id;
						companiesCreated += 1;
						if (plan.domain) companyIdByDomain.set(plan.domain, companyId);
					}

					if (companyId && Object.keys(plan.fields).length > 0) {
						await this.fields.applyValues(
							tx,
							"COMPANY",
							companyId,
							plan.fields,
						);
					}
				}

				if (row.contact.action !== "skip") {
					const plan = row.contact;
					let contactId: string;

					if (plan.action === "update" && plan.existingId) {
						contactId = plan.existingId;
						await tx.contact.update({
							where: { id: contactId },
							data: {
								title: plan.title ?? undefined,
								linkedinUrl: plan.linkedinUrl ?? undefined,
								companyId: companyId ?? undefined,
							},
						});
						contactsUpdated += 1;
					} else if (
						plan.action === "reuse-pending" &&
						plan.email &&
						contactIdByEmail.has(plan.email)
					) {
						contactId = contactIdByEmail.get(plan.email) as string;
					} else {
						const created = await tx.contact.create({
							data: {
								firstName: plan.firstName,
								lastName: plan.lastName,
								email: plan.email,
								title: plan.title,
								linkedinUrl: plan.linkedinUrl,
								companyId,
								source: RecordSource.IMPORT,
							},
							select: { id: true },
						});
						contactId = created.id;
						contactsCreated += 1;
						if (plan.email) contactIdByEmail.set(plan.email, contactId);
					}

					if (Object.keys(plan.fields).length > 0) {
						await this.fields.applyValues(
							tx,
							"CONTACT",
							contactId,
							plan.fields,
						);
					}
				}
			});
		}

		return {
			companiesCreated,
			companiesUpdated,
			contactsCreated,
			contactsUpdated,
		};
	}

	private async evaluate(rows: ImportRowInput[]): Promise<EvaluatedImport> {
		const unrecognizedHeaders = [
			...new Set(
				rows
					.flatMap((row) => Object.keys(row))
					.filter((key) => !ALLOWED_HEADERS.has(key)),
			),
		];

		const domains = new Set<string>();
		const emails = new Set<string>();

		type Parsed =
			| { rowIndex: number; error: string }
			| {
					rowIndex: number;
					error: null;
					row: ImportRowInput;
					companyName: string | undefined;
					domain: string | null;
					firstName: string | undefined;
					email: string | null;
			  };

		const parsedRows: Parsed[] = rows.map((row, rowIndex) => {
			const companyName = cell(row, "company_name");
			const firstName = cell(row, "first_name");
			const rawEmail = cell(row, "email");

			if (!companyName && !firstName) {
				return {
					rowIndex,
					error:
						"Linha vazia: não há nome de empresa (company_name) nem nome de contato (first_name).",
				};
			}

			if (!firstName && rawEmail) {
				return {
					rowIndex,
					error:
						"Há email nesta linha, mas first_name está vazio — todo contato precisa de um nome.",
				};
			}

			let domain: string | null = null;
			if (companyName) {
				domain =
					normalizeDomain(cell(row, "company_domain") ?? null) ??
					domainFromEmail(rawEmail ?? null);
				if (domain) domains.add(domain);
			}

			let email: string | null = null;
			if (firstName) {
				email = normalizeEmail(rawEmail ?? "");
				if (email) emails.add(email);
			}

			return {
				rowIndex,
				error: null,
				row,
				companyName,
				domain,
				firstName,
				email,
			};
		});

		const [existingCompanies, existingContacts] = await Promise.all([
			domains.size > 0
				? this.db.company.findMany({
						where: { domain: { in: [...domains] }, archivedAt: null },
						select: { id: true, domain: true },
					})
				: Promise.resolve([]),
			emails.size > 0
				? this.db.contact.findMany({
						where: { email: { in: [...emails] }, archivedAt: null },
						select: { id: true, email: true },
					})
				: Promise.resolve([]),
		]);

		const companyIdByDomain = new Map(
			existingCompanies
				.filter((company) => company.domain)
				.map((company) => [company.domain as string, company.id]),
		);
		const contactIdByEmail = new Map(
			existingContacts
				.filter((contact) => contact.email)
				.map((contact) => [contact.email as string, contact.id]),
		);

		const pendingDomains = new Set<string>();
		const pendingEmails = new Set<string>();

		const planned: RowPlan[] = parsedRows.map((parsed) => {
			if (parsed.error !== null) {
				return {
					rowIndex: parsed.rowIndex,
					company: { action: "skip" },
					contact: { action: "skip" },
					error: parsed.error,
				};
			}

			const { rowIndex, companyName, domain, firstName, email, row } = parsed;

			let company: CompanyPlan = { action: "skip" };
			if (companyName) {
				const fields: Record<string, string> = {};
				const accountType = cell(row, "account_type");
				const leadSource = cell(row, "lead_source");
				if (accountType) fields.account_type = accountType;
				if (leadSource) fields.lead_source = leadSource;

				const base = {
					domain,
					name: companyName,
					industry: cell(row, "industry") ?? null,
					country: cell(row, "country") ?? null,
					countryCode: cell(row, "country_code") ?? null,
					fields,
				};

				if (domain && companyIdByDomain.has(domain)) {
					company = {
						action: "update",
						existingId: companyIdByDomain.get(domain) ?? null,
						...base,
					};
				} else if (domain && pendingDomains.has(domain)) {
					company = { action: "reuse-pending", existingId: null, ...base };
				} else {
					if (domain) pendingDomains.add(domain);
					company = { action: "create", existingId: null, ...base };
				}
			}

			let contact: ContactPlan = { action: "skip" };
			if (firstName) {
				const fields: Record<string, string> = {};
				const idioma = cell(row, "idioma");
				const evento = cell(row, "evento_de_origem");
				const gancho = cell(row, "mensagem_gancho");
				const abordagem = cell(row, "abordagem_sugerida");
				if (idioma) fields.idioma = idioma;
				if (evento) fields.evento_de_origem = evento;
				if (gancho) fields.mensagem_gancho = gancho;
				if (abordagem) fields.abordagem_sugerida = abordagem;

				const base = {
					email,
					firstName,
					lastName: cell(row, "last_name") ?? null,
					title: cell(row, "title") ?? null,
					linkedinUrl: cell(row, "linkedin_url") ?? null,
					fields,
				};

				if (email && contactIdByEmail.has(email)) {
					contact = {
						action: "update",
						existingId: contactIdByEmail.get(email) ?? null,
						...base,
					};
				} else if (email && pendingEmails.has(email)) {
					contact = { action: "reuse-pending", existingId: null, ...base };
				} else {
					if (email) pendingEmails.add(email);
					contact = { action: "create", existingId: null, ...base };
				}
			}

			return { rowIndex, company, contact, error: null };
		});

		return { unrecognizedHeaders, rows: planned };
	}

	private summarize(evaluated: EvaluatedImport): ImportPreviewOutput {
		let companiesToCreate = 0;
		let companiesToUpdate = 0;
		let contactsToCreate = 0;
		let contactsToUpdate = 0;
		const errors: { rowIndex: number; message: string }[] = [];

		for (const row of evaluated.rows) {
			if (row.error) {
				errors.push({ rowIndex: row.rowIndex, message: row.error });
				continue;
			}

			if (row.company.action === "create") companiesToCreate += 1;
			if (
				row.company.action === "update" ||
				row.company.action === "reuse-pending"
			) {
				companiesToUpdate += 1;
			}

			if (row.contact.action === "create") contactsToCreate += 1;
			if (
				row.contact.action === "update" ||
				row.contact.action === "reuse-pending"
			) {
				contactsToUpdate += 1;
			}
		}

		return {
			totalRows: evaluated.rows.length,
			companiesToCreate,
			companiesToUpdate,
			contactsToCreate,
			contactsToUpdate,
			unrecognizedHeaders: evaluated.unrecognizedHeaders,
			errors,
		};
	}
}
