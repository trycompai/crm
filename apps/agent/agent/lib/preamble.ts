import { db } from "@crm/db";
import { websiteUrl } from "@crm/db/workspace";
import { capabilitiesMarkdown } from "./capabilities";
import { identity, usMarkdown, type WorkspaceIdentity } from "./workspace";

export type Opened = {
	dispatched: boolean;
	kind?: string | null;
	reason?: string | null;
	budget?: number | null;
};

export type Preamble = {
	markdown: string;
	focus: {
		contactId?: string | null;
		companyId?: string | null;
		prospectId?: string | null;
	};
};

export async function sessionPreamble(
	record: {
		contactId?: string | null;
		companyId?: string | null;
		dealId?: string | null;
		prospectId?: string | null;
	},
	opened: Opened,
): Promise<Preamble> {
	if (opened.kind === "workspace-profile") return workspacePreamble();
	if (opened.kind === "lead-discovery") return leadDiscoveryPreamble(opened);
	if (opened.kind === "outreach-compose" && record.prospectId) {
		return outreachPreamble(record.prospectId, opened);
	}
	if (opened.kind === "customer-onboarding-plan" && record.dealId) {
		return onboardingPreamble(record.dealId, opened);
	}
	if (record.prospectId) return prospectPreamble(record.prospectId, opened);
	if (record.contactId) return contactPreamble(record.contactId, opened);
	if (record.dealId) return dealPreamble(record.dealId, opened);
	if (record.companyId) return companyPreamble(record.companyId, opened);
	return noRecordPreamble();
}

async function leadDiscoveryPreamble(opened: Opened): Promise<Preamble> {
	return {
		markdown: [
			"## This session",
			"",
			"This is a one-click lead-supply run for Lode.",
			opened.reason ?? "Find a fresh evidence-backed prospect batch.",
			opened.budget ? `Target up to ${opened.budget} retained candidates.` : "",
			"Load `first-customer-discovery` before searching.",
			"Call `record_discovered_prospects` exactly once and never send outreach.",
			"",
			await closing(),
		]
			.filter(Boolean)
			.join("\n"),
		focus: {},
	};
}

async function outreachPreamble(
	prospectId: string,
	opened: Opened,
): Promise<Preamble> {
	return {
		markdown: [
			"## This session",
			"",
			`Prepare the human-reviewed outreach sequence for prospect \`${prospectId}\`.`,
			opened.reason ?? "",
			"Load `outreach-sequence`, then call `read_outreach_assignment`.",
			"Call `record_outreach_sequence` exactly once. Never approve or send email.",
			"",
			await closing(),
		]
			.filter(Boolean)
			.join("\n"),
		focus: { prospectId },
	};
}

async function onboardingPreamble(
	dealId: string,
	opened: Opened,
): Promise<Preamble> {
	return {
		markdown: [
			"## This session",
			"",
			`Build the customer onboarding discovery plan for closed-won deal \`${dealId}\`.`,
			opened.reason ?? "",
			"Load `customer-onboarding`, read the deal and CRM history, then call `record_customer_onboarding_plan` exactly once.",
			"Do not claim access to a system or dataset that the customer has not confirmed.",
			"",
			await closing(),
		]
			.filter(Boolean)
			.join("\n"),
		focus: {},
	};
}

export async function prospectPreamble(
	prospectId: string,
	opened: Opened,
): Promise<Preamble> {
	const prospect = await db.prospect.findUnique({
		where: { id: prospectId },
		select: {
			companyName: true,
			website: true,
			location: true,
			country: true,
			status: true,
			fitScore: true,
			namedPerson: true,
			role: true,
			companyProof: true,
			painSignal: true,
			whyNow: true,
			evidence: { select: { url: true }, take: 10 },
		},
	});

	if (!prospect) {
		return { markdown: await closing(), focus: { prospectId } };
	}

	const known = prospect.evidence.map((evidence) => evidence.url).join("\n");
	const markdown = [
		"## This session",
		"",
		`You are researching prospect **${prospect.companyName}** — prospect id \`${prospectId}\`.`,
		prospect.website ? `Website: ${prospect.website}` : "No website is stored.",
		[prospect.location, prospect.country].filter(Boolean).join(", "),
		`Current status: **${prospect.status}**${prospect.fitScore === null ? "" : `, prior score ${prospect.fitScore}/100`}.`,
		prospect.namedPerson
			? `Named person: ${prospect.namedPerson}${prospect.role ? ` — ${prospect.role}` : ""}.`
			: "No named decision-maker is confirmed.",
		opened.reason ? `Why now: ${opened.reason}` : "",
		opened.budget
			? `Budget: **${opened.budget}** vendor calls. Spend them where they matter.`
			: "",
		"",
		opening(
			opened,
			"why this account fits, which current public signal matters, and whether a real person and route are ready",
		),
		"",
		"Load `first-customer-research` before searching. Start with `read_prospect` on this id.",
		"Prioritise a current official job posting, then official careers, project, news and team pages. Use `fetch_prospect_source` for every retained page.",
		"A search result is a lead, not evidence. Record the fetch receipt, source title, final URL, visible date, direct observation and separate inference.",
		"Do not stop at a company. Find the current person whose remit owns the evidenced operating problem and verify their role from a public source.",
		"Call `record_prospect_research` until the first successful write. If a fresh receipt rejects one source, make at most one corrective call with that unsupported source removed or rewritten. It computes the score, checks suppression, stores the evidence and promotes only a perfect account into Company and Contact records.",
		"Never send outreach, submit a form, connect, follow or comment.",
		prospect.companyProof
			? `Existing company proof: ${prospect.companyProof}`
			: "",
		prospect.painSignal ? `Existing pain signal: ${prospect.painSignal}` : "",
		prospect.whyNow ? `Existing why-now: ${prospect.whyNow}` : "",
		known
			? `Existing source URLs:\n${known}`
			: "There are no stored evidence URLs yet.",
		"",
		await closing(),
	]
		.filter(Boolean)
		.join("\n");

	return { markdown, focus: { prospectId } };
}

export async function composeClosing(
	us: WorkspaceIdentity | null,
): Promise<string> {
	return [usMarkdown(us), await capabilitiesMarkdown()]
		.filter(Boolean)
		.join("\n\n");
}

async function closing(): Promise<string> {
	return composeClosing(await identity());
}

function opening(opened: Opened, questions: string): string {
	if (opened.dispatched) {
		return [
			"This session was started by the dispatcher, not by a person. Nobody is",
			"waiting on a reply — do the work, record what you find, and stop.",
		].join(" ");
	}

	return [
		"**A rep has this record open and is talking to you.** Answer what they",
		`actually asked — usually some form of ${questions} — from what the CRM`,
		"already holds, and say plainly when we do not know something. Research it",
		"further only if the answer needs it or they ask you to. Never ask them for",
		"an id, a name or an address you can look up yourself.",
	].join(" ");
}

export async function contactPreamble(
	contactId: string,
	opened: Opened,
): Promise<Preamble> {
	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: {
			firstName: true,
			lastName: true,
			email: true,
			title: true,
			company: {
				select: {
					id: true,
					name: true,
					domain: true,
					_count: { select: { granolaNotes: true } },
				},
			},
			brief: { select: { refreshedAt: true } },
			deals: {
				orderBy: { deal: { lastActivityAt: "desc" } },
				take: 5,
				select: {
					role: true,
					deal: { select: { id: true, name: true, stage: true } },
				},
			},
			_count: {
				select: {
					emailThreads: true,
					calendarEvents: true,
					granolaNotes: true,
				},
			},
		},
	});

	if (!contact) {
		return { markdown: await closing(), focus: { contactId } };
	}

	const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

	const granolaCalls = Math.max(
		contact._count.granolaNotes,
		contact.company?._count.granolaNotes ?? 0,
	);
	const known =
		contact._count.emailThreads > 0 ||
		contact._count.calendarEvents > 0 ||
		granolaCalls > 0
			? `We have ${contact._count.emailThreads} thread(s), ${contact._count.calendarEvents} calendar meeting(s), and ${granolaCalls} Granola call(s) on this account — read those first.`
			: "We have never corresponded with them, so there is nothing internal to go on.";

	const deals = contact.deals
		.map(
			({ role, deal }) =>
				`${deal.name} (${deal.stage}${role ? `, ${role}` : ""}) \`${deal.id}\``,
		)
		.join("; ");

	const markdown = [
		"## This session",
		"",
		`You are working on **${name}** (\`${contactId}\`)${
			contact.email ? `, ${contact.email}` : ""
		}${contact.title ? `, ${contact.title}` : ""}.`,
		opened.kind ? `Task: **${opened.kind}**.` : "",
		opened.reason ? `Why now: ${opened.reason}` : "",
		opened.budget
			? `Budget: **${opened.budget}** vendor calls. Spend them where they matter.`
			: "",
		"",
		opening(
			opened,
			"who this person is, whether they are still there, or what to know before a call",
		),
		"",
		contact.company
			? `They work at **${contact.company.name}**${
					contact.company.domain ? ` (${contact.company.domain})` : ""
				}, company id \`${contact.company.id}\` — pass that straight to \`read_company_history\`, \`enrich_company\` or \`research_company\` when the question reaches past this one person.`
			: "They are not attached to a company. `search_crm` will find one by name or domain if the conversation needs it.",
		deals ? `They are on: ${deals}.` : "They are not on any deal.",
		"",
		known,
		contact.brief
			? `A background already exists, written ${contact.brief.refreshedAt.toDateString()}. Replace it only if you learn something it does not say.`
			: "There is no background on them yet.",
		"",
		"Start with `read_crm_history` on this contact id.",
		"",
		await closing(),
	]
		.filter(Boolean)
		.join("\n");

	return {
		markdown,
		focus: { contactId, companyId: contact.company?.id ?? null },
	};
}

export async function companyPreamble(
	companyId: string,
	opened: Opened,
): Promise<Preamble> {
	const company = await db.company.findUnique({
		where: { id: companyId },
		select: {
			name: true,
			domain: true,
			industry: true,
			description: true,
			contacts: {
				orderBy: [{ lastActivityAt: "desc" }, { createdAt: "asc" }],
				take: 12,
				select: { id: true, firstName: true, lastName: true, title: true },
			},
			deals: {
				orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
				take: 8,
				select: { id: true, name: true, stage: true },
			},
			_count: { select: { contacts: true } },
		},
	});

	if (!company) {
		return { markdown: await closing(), focus: { companyId } };
	}

	const people = company.contacts
		.map((person) => {
			const name = [person.firstName, person.lastName]
				.filter(Boolean)
				.join(" ");
			return `- ${name}${person.title ? ` — ${person.title}` : ""} \`${person.id}\``;
		})
		.join("\n");

	const more =
		company._count.contacts > company.contacts.length
			? `\n- …and ${company._count.contacts - company.contacts.length} more; \`read_company_history\` lists them all.`
			: "";

	const deals = company.deals
		.map((deal) => `${deal.name} (${deal.stage}) \`${deal.id}\``)
		.join("; ");

	const markdown = [
		"## This session",
		"",
		`You are working on **${company.name}**${
			company.domain ? ` (${company.domain})` : ""
		}${company.industry ? `, ${company.industry}` : ""} — company id \`${companyId}\`.`,
		"",
		opening(
			opened,
			"what this company does, who we know there, or what has changed recently",
		),
		"",
		people
			? `### Who we know there (${company._count.contacts})\n\n${people}${more}\n\nThose are contact ids. Use them directly — with \`read_crm_history\`, \`identify_contact\` or \`record_fact\`. Never ask a rep which contact they mean without naming these first.`
			: "We have no contacts on file here yet.",
		"",
		deals ? `Deals: ${deals}.` : "There are no deals here.",
		company.description
			? "There is already a description on the record."
			: "There is no description on the record yet.",
		"",
		"Start with `read_company_history` on this company id — it returns the people, the deals, the correspondence and the notes in one free call.",
		"",
		await closing(),
	]
		.filter(Boolean)
		.join("\n");

	return { markdown, focus: { companyId } };
}

export async function dealPreamble(
	dealId: string,
	opened: Opened,
): Promise<Preamble> {
	const deal = await db.deal.findUnique({
		where: { id: dealId },
		select: {
			name: true,
			description: true,
			stage: true,
			amount: true,
			currency: true,
			expectedCloseDate: true,
			lastActivityAt: true,
			company: { select: { id: true, name: true } },
			contacts: {
				select: {
					role: true,
					contact: {
						select: { id: true, firstName: true, lastName: true, title: true },
					},
				},
			},
		},
	});

	if (!deal) return { markdown: await closing(), focus: {} };

	const people = deal.contacts
		.map(({ role, contact }) => {
			const name = [contact.firstName, contact.lastName]
				.filter(Boolean)
				.join(" ");
			return `${name}${contact.title ? ` (${contact.title})` : ""}${
				role ? ` — ${role}` : ""
			} \`${contact.id}\``;
		})
		.join("; ");

	const markdown = [
		"## This session",
		"",
		`You are working on the deal **${deal.name}**${
			deal.company ? ` at ${deal.company.name}` : ""
		} — deal id \`${dealId}\`${
			deal.company ? `, company id \`${deal.company.id}\`` : ""
		}.`,
		`Stage: **${deal.stage}**${
			deal.amount
				? `. Amount: ${deal.amount} ${deal.currency ?? ""}`.trim()
				: ""
		}${
			deal.expectedCloseDate
				? `. Expected close: ${deal.expectedCloseDate.toDateString()}`
				: ""
		}.`,
		deal.lastActivityAt
			? `Last touched ${deal.lastActivityAt.toDateString()}.`
			: "Nothing has happened on it yet.",
		...(deal.description
			? [`The rep's own description of it: "${deal.description}"`]
			: []),
		people ? `People on it: ${people}` : "Nobody is attached to it yet.",
		"",
		opening(
			opened,
			"where this stands, who else should be involved, or what the risk is",
		),
		"",
		"Start with `read_deal_history` on this deal id. It returns the stage clock, every stage this deal has moved through, the last reply from their side and the next meeting — which is how you answer *where does this stand* rather than reciting the stage field back.",
		"",
		"You can research the people and the company behind it with the usual tools — a deal itself has no fields to enrich, so anything you learn is recorded against them.",
		"",
		await closing(),
	].join("\n");

	return { markdown, focus: { companyId: deal.company?.id ?? null } };
}

export async function noRecordPreamble(): Promise<Preamble> {
	return {
		markdown: [
			"## This session",
			"",
			"No record was named, so nothing is in focus yet.",
			"`list_outstanding_work` shows contacts with research outstanding, and",
			"`search_crm` finds any contact, company or deal by name, email address or",
			"domain. Look the record up rather than asking for an id.",
			"",
			await closing(),
		].join("\n"),
		focus: {},
	};
}

export async function workspacePreamble(
	known?: WorkspaceIdentity | null,
): Promise<Preamble> {
	const us = known === undefined ? await identity() : known;
	const site = websiteUrl(us?.website);

	if (!us || !site) {
		return {
			markdown: [
				"## This session",
				"",
				"You were asked to write the profile of the company you work for, and",
				"this install has no web address on record — nobody gave one, or what is",
				"stored is not one. There is nothing to read. Stop — do not guess at it",
				"from the email addresses in the CRM.",
			].join("\n"),
			focus: {},
		};
	}

	const markdown = [
		"## This session",
		"",
		`You are writing the profile of **the company you work for** — ${us.name} (${us.website}).`,
		us.profile
			? `One already exists, written ${us.profile.refreshedAt.toDateString()}. Replace it only if the site now says something different.`
			: "There is no profile of us yet.",
		"",
		`Read ${site} with \`web_fetch\` — the home page, and the pricing or product`,
		"page if there is one — and search the web only if the site does not say who",
		"the customer is. Then call `write_workspace_profile`.",
		"",
		"**Every other session opens with what you write here**, in front of the",
		"record a rep is asking about, so it has to be short and it has to be",
		"substance. The tool enforces that: 320 characters of narrative and one",
		"short line each for what we sell, who we sell to, and what we are picked",
		"over. Leave a line out rather than padding it. No marketing adjectives —",
		'"leading", "innovative" and "best-in-class" say nothing a rep can use.',
		"",
		"You are describing us to a colleague who has just joined, not writing our",
		"home page back to us.",
		"",
		await capabilitiesMarkdown(),
	].join("\n");

	return { markdown, focus: {} };
}
