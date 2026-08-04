import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

export type SearchHit = {
	kind: "company" | "contact" | "deal";
	id: string;
	label: string;
	detail: string | null;
	iconUrl: string | null;
	iconDarkUrl: string | null;
	iconTone: string | null;
	imageUrl: string | null;
};

const PER_KIND = 5;

@Injectable()
export class SearchService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async quick(q: string): Promise<{ hits: SearchHit[] }> {
		const term = q.trim();
		if (term.length < 2) return { hits: [] };

		const [companies, contacts, deals] = await Promise.all([
			this.db.company.findMany({
				where: {
					OR: [
						{ name: { contains: term, mode: "insensitive" } },
						{ domain: { contains: term, mode: "insensitive" } },
					],
				},
				take: PER_KIND,
				orderBy: { name: "asc" },
				select: {
					id: true,
					name: true,
					domain: true,
					iconUrl: true,
					iconDarkUrl: true,
					iconTone: true,
				},
			}),
			this.db.contact.findMany({
				where: {
					OR: [
						{ firstName: { contains: term, mode: "insensitive" } },
						{ lastName: { contains: term, mode: "insensitive" } },
						{ email: { contains: term, mode: "insensitive" } },
					],
				},
				take: PER_KIND,
				orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					imageUrl: true,
					company: { select: { name: true } },
				},
			}),
			this.db.deal.findMany({
				where: { name: { contains: term, mode: "insensitive" } },
				take: PER_KIND,
				orderBy: [{ stage: "asc" }, { name: "asc" }],
				select: {
					id: true,
					name: true,
					company: {
						select: {
							name: true,
							iconUrl: true,
							iconDarkUrl: true,
							iconTone: true,
						},
					},
				},
			}),
		]);

		return {
			hits: [
				...companies.map(
					(company): SearchHit => ({
						kind: "company",
						id: company.id,
						label: company.name,
						detail: company.domain,
						iconUrl: company.iconUrl,
						iconDarkUrl: company.iconDarkUrl,
						iconTone: company.iconTone,
						imageUrl: null,
					}),
				),
				...contacts.map(
					(contact): SearchHit => ({
						kind: "contact",
						id: contact.id,
						label:
							[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
							(contact.email ?? "Unnamed"),
						detail: contact.company?.name ?? contact.email,
						iconUrl: null,
						iconDarkUrl: null,
						iconTone: null,
						imageUrl: contact.imageUrl,
					}),
				),
				...deals.map(
					(deal): SearchHit => ({
						kind: "deal",
						id: deal.id,
						label: deal.name,
						detail: deal.company?.name ?? "Individual prospect",
						iconUrl: deal.company?.iconUrl ?? null,
						iconDarkUrl: deal.company?.iconDarkUrl ?? null,
						iconTone: deal.company?.iconTone ?? null,
						imageUrl: null,
					}),
				),
			],
		};
	}
}
