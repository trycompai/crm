import { ActivityType, db, type Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import type { CompanySource } from "./companies";

export type NewContact = {
	firstName: string;
	lastName?: string | null;
	title?: string | null;
	email?: string | null;
	companyId: string;
	source: CompanySource;
};

export type CreatedContact = {
	created: boolean;
	id: string;
	firstName: string;
	lastName: string | null;
	companyId: string | null;
	reason?: string;
};

const select = {
	id: true,
	firstName: true,
	lastName: true,
	companyId: true,
};

async function existingContact(
	input: NewContact,
	email: string | null,
): Promise<CreatedContact | null> {
	if (email) {
		const byEmail = await db.contact.findFirst({
			where: {
				email: { equals: email, mode: "insensitive" },
				archivedAt: null,
			},
			select,
		});
		if (byEmail) return { created: false, ...byEmail };
	}

	const where: Prisma.ContactWhereInput = {
		firstName: { equals: input.firstName.trim(), mode: "insensitive" },
		companyId: input.companyId,
		archivedAt: null,
	};
	const lastName = input.lastName?.trim();
	if (lastName) where.lastName = { equals: lastName, mode: "insensitive" };

	const byName = await db.contact.findFirst({ where, select });
	return byName ? { created: false, ...byName } : null;
}

export async function createContact(
	input: NewContact,
): Promise<CreatedContact> {
	const company = await db.company.findFirst({
		where: { id: input.companyId, archivedAt: null },
		select: { id: true, name: true, ownerId: true },
	});
	if (!company) {
		return {
			created: false,
			id: "",
			firstName: input.firstName,
			lastName: input.lastName ?? null,
			companyId: null,
			reason: "No such company. Add the company first.",
		};
	}

	const email = input.email?.trim().toLowerCase() || null;
	const existing = await existingContact(input, email);
	if (existing) {
		return {
			...existing,
			reason: `${existing.firstName} ${existing.lastName ?? ""}`
				.trim()
				.concat(" is already in the CRM."),
		};
	}

	const occurredAt = new Date();
	const created = await db.$transaction(async (tx) => {
		const contact = await tx.contact.create({
			data: {
				firstName: input.firstName.trim(),
				lastName: input.lastName?.trim() || null,
				title: input.title?.trim() || null,
				email,
				companyId: company.id,
				ownerId: company.ownerId,
			},
			select,
		});

		const payload: Prisma.InputJsonObject = {
			type: "contact.created",
			record: { kind: "contact", id: contact.id },
			occurredAt: occurredAt.toISOString(),
			data: {
				firstName: contact.firstName,
				lastName: contact.lastName,
				companyId: company.id,
			},
		};
		await tx.agentTask.create({
			data: {
				contactId: contact.id,
				companyId: company.id,
				kind: "agent-event",
				reason: "contact.created",
				payload,
				priority: PRIORITY.event,
				budget: 1,
				dueAt: occurredAt,
			},
		});

		return contact;
	});

	const author =
		company.ownerId ??
		(
			await db.user.findFirst({
				orderBy: { createdAt: "asc" },
				select: { id: true },
			})
		)?.id ??
		null;
	if (author) {
		await db.activity.create({
			data: {
				type: ActivityType.ENRICHMENT,
				subject: `Added from ${input.source.label}`,
				body: [
					`${created.firstName} ${created.lastName ?? ""}`.trim(),
					input.title?.trim() ? `(${input.title.trim()})` : null,
					`was added by the agent to ${company.name} from ${input.source.label}.`,
					`Source: ${input.source.url}`,
				]
					.filter(Boolean)
					.join(" "),
				occurredAt,
				contactId: created.id,
				companyId: company.id,
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

	return { created: true, ...created };
}
