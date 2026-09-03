import { ActivityType, db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import {
	type ContactDetails,
	configuredProviders,
	lookupContactDetails,
} from "../lib/contact-details";
import { CONTACT_DETAILS_PROVIDERS } from "../lib/contact-details-providers";
import { focusOn, spend } from "../lib/focus";
import { domainOf } from "../lib/names";

function describeSources(details: ContactDetails): string {
	if (details.sources.length > 0) {
		return `Seen on: ${details.sources.map((s) => s.url).join(", ")}`;
	}
	return details.reference
		? `Attested by ${details.provider} (record ${details.reference}).`
		: `Attested by ${details.provider}, which gave no public page.`;
}

export default defineTool({
	description:
		"Find a contact's work email and phone from their name and their employer's domain: the configured contact-data providers first (Hunter, Apollo, Lusha, Dropcontact, ZoomInfo), then the employer's own website (contact, team and legal pages), stopping at the first confident answer. Fills the email and phone only where the record has none, and always writes the candidate, its confidence and its source to the contact's timeline. A website read costs nothing; a provider call costs one unit.",
	inputSchema: z.object({
		contactId: z.string(),
	}),
	async execute({ contactId }) {
		const providers = configuredProviders(CONTACT_DETAILS_PROVIDERS);
		const metered = providers.some((provider) => provider.keys.length > 0);

		focusOn({ contactId });

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				phone: true,
				company: {
					select: { id: true, name: true, domain: true, ownerId: true },
				},
			},
		});

		if (!contact) return { ok: false as const, reason: "No such contact." };
		if (!contact.lastName) {
			return {
				ok: false as const,
				reason: "The contact has no last name yet. Identify them first.",
			};
		}

		const domain =
			contact.company?.domain ??
			(contact.email ? domainOf(contact.email) : null);
		if (!domain) {
			return {
				ok: false as const,
				reason:
					"No employer domain to search. Set the company's website first.",
			};
		}

		if (metered) {
			const charge = spend(1);
			if (!charge.ok) return { ok: false as const, reason: charge.reason };
		}

		const lookup = await lookupContactDetails(
			{
				firstName: contact.firstName,
				lastName: contact.lastName,
				domain,
				companyName: contact.company?.name ?? null,
			},
			CONTACT_DETAILS_PROVIDERS,
		);

		if (lookup.outcome === "unconfigured") {
			return { ok: false as const, reason: "No provider is configured." };
		}
		if (lookup.outcome === "none") {
			return {
				ok: true as const,
				email: null,
				phones: [],
				tried: lookup.tried,
				reasons: lookup.reasons,
				note: "No provider has an address it trusts for this person, and the employer's website does not name them. Leave the email blank rather than guessing a pattern.",
			};
		}

		const { details } = lookup;
		const author =
			contact.company?.ownerId ??
			(await db.user.findFirst({ select: { id: true } }))?.id ??
			null;

		const phone = details.phones[0]?.number ?? null;
		const filledEmail = Boolean(details.email) && !contact.email;
		const filledPhone = Boolean(phone) && !contact.phone;

		if (filledEmail || filledPhone) {
			await db.contact.update({
				where: { id: contact.id },
				data: {
					email: filledEmail ? details.email : undefined,
					phone: filledPhone ? phone : undefined,
				},
			});
		}

		if (author) {
			await db.activity.create({
				data: {
					type: ActivityType.ENRICHMENT,
					subject: filledEmail
						? "Contact details found"
						: "Contact details candidate",
					body: [
						details.email
							? `${details.email} (confidence ${details.confidence}).`
							: null,
						phone ? `Phone ${phone}.` : null,
						describeSources(details),
						details.email && !filledEmail
							? `The record keeps ${contact.email}.`
							: null,
					]
						.filter(Boolean)
						.join(" "),
					occurredAt: new Date(),
					contactId: contact.id,
					companyId: contact.company?.id ?? null,
					createdById: author,
					meta: {
						source: details.provider,
						confidence: details.confidence,
						reference: details.reference,
						sources: details.sources.map((s) => s.url),
						tried: lookup.tried,
						agent: "people-research",
					},
				},
				select: { id: true },
			});
		}

		return {
			ok: true as const,
			provider: details.provider,
			email: details.email,
			confidence: details.confidence,
			phones: details.phones,
			title: details.title,
			linkedinUrl: details.linkedinUrl,
			sources: details.sources,
			filledEmail,
			filledPhone,
			tried: lookup.tried,
		};
	},
});
