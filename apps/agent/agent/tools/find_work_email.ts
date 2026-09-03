import { ActivityType, db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";
import { focusOn, spend } from "../lib/focus";
import { findWorkEmail, HUNTER_API_KEY, hunterEnabled } from "../lib/hunter";
import { HUNTER } from "../lib/hunter-config";
import { domainOf } from "../lib/names";

export default defineTool({
	description:
		"Find a contact's work email address from their name and their employer's domain, through Hunter, with the public pages the address was seen on. Writes the candidate and its sources to the contact's timeline, and fills the email in when the record has none. Needs HUNTER_API_KEY; without it the tool says so and nothing is charged.",
	inputSchema: z.object({
		contactId: z.string(),
	}),
	async execute({ contactId }) {
		if (!hunterEnabled()) return unavailable(HUNTER_API_KEY);

		focusOn({ contactId });

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
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

		const charge = spend(1);
		if (!charge.ok) return { ok: false as const, reason: charge.reason };

		const result = await findWorkEmail({
			firstName: contact.firstName,
			lastName: contact.lastName,
			domain,
		});
		if (!result.ok) return { ok: false as const, reason: result.reason };

		const found = result.data;
		if (!found.email || found.score < HUNTER.minScore) {
			return {
				ok: true as const,
				email: null,
				score: found.score,
				note: "Hunter has no address it trusts for this person. Leave the email blank rather than guessing a pattern.",
			};
		}

		const author =
			contact.company?.ownerId ??
			(await db.user.findFirst({ select: { id: true } }))?.id ??
			null;

		const filled = !contact.email;
		if (filled) {
			await db.contact.update({
				where: { id: contact.id },
				data: { email: found.email },
			});
		}

		if (author) {
			await db.activity.create({
				data: {
					type: ActivityType.ENRICHMENT,
					subject: filled ? "Work email found" : "Work email candidate",
					body: [
						`${found.email} (Hunter score ${found.score}).`,
						found.sources.length > 0
							? `Seen on: ${found.sources.map((s) => s.url).join(", ")}`
							: "Hunter gave no public page for it.",
						filled ? null : `The record keeps ${contact.email}.`,
					]
						.filter(Boolean)
						.join(" "),
					occurredAt: new Date(),
					contactId: contact.id,
					companyId: contact.company?.id ?? null,
					createdById: author,
					meta: {
						source: "hunter.io",
						endpoint: "email-finder",
						score: found.score,
						sources: found.sources.map((s) => s.url),
						agent: "people-research",
					},
				},
				select: { id: true },
			});
		}

		return {
			ok: true as const,
			email: found.email,
			score: found.score,
			position: found.position,
			sources: found.sources,
			filled,
		};
	},
});
