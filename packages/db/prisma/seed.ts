import { mirror } from "../src/blob";
import { db } from "../src/client";
import { DEFAULT_REPORTING_CURRENCY } from "../src/currency";
import { resolveFavicon } from "../src/favicon";
import {
	ActivityType,
	DealStage,
	RateSource,
} from "../src/generated/prisma/enums";
import { ensureDefaultSegments } from "../src/marketing/segments";
import { readReportingCurrency, SETTINGS_ID } from "../src/settings";

function makeRandom(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const random = makeRandom(20260731);

function pick<T>(items: readonly T[]): T {
	const item = items[Math.floor(random() * items.length)];
	if (item === undefined) throw new Error("pick() on an empty list");
	return item;
}

function chance(probability: number): boolean {
	return random() < probability;
}

function integer(min: number, max: number): number {
	return min + Math.floor(random() * (max - min + 1));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function daysFromNow(days: number, jitterHours = 0): Date {
	const jitter = jitterHours
		? (random() - 0.5) * jitterHours * 60 * 60 * 1000
		: 0;
	return new Date(NOW + days * DAY_MS + jitter);
}

const OWNERS = [
	{ name: "Ada Okafor", email: "ada@trycomp.ai" },
	{ name: "Marcus Lindqvist", email: "marcus@trycomp.ai" },
	{ name: "Priya Raman", email: "priya@trycomp.ai" },
] as const;

type SeedCompany = {
	name: string;
	domain: string;
	industry: string;
	city: string;
	country: string;
	countryCode: string;
};

const COMPANIES: readonly SeedCompany[] = [
	{
		name: "Stripe",
		domain: "stripe.com",
		industry: "Financial Services",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Linear",
		domain: "linear.app",
		industry: "Software",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Vercel",
		domain: "vercel.com",
		industry: "Software",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Ramp",
		domain: "ramp.com",
		industry: "Financial Services",
		city: "New York",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Notion",
		domain: "notion.so",
		industry: "Software",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Monzo",
		domain: "monzo.com",
		industry: "Banking",
		city: "London",
		country: "United Kingdom",
		countryCode: "GB",
	},
	{
		name: "Wise",
		domain: "wise.com",
		industry: "Financial Services",
		city: "London",
		country: "United Kingdom",
		countryCode: "GB",
	},
	{
		name: "Personio",
		domain: "personio.com",
		industry: "Human Resources",
		city: "Munich",
		country: "Germany",
		countryCode: "DE",
	},
	{
		name: "Pennylane",
		domain: "pennylane.com",
		industry: "Accounting",
		city: "Paris",
		country: "France",
		countryCode: "FR",
	},
	{
		name: "Cal.com",
		domain: "cal.com",
		industry: "Software",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Supabase",
		domain: "supabase.com",
		industry: "Software",
		city: "Singapore",
		country: "Singapore",
		countryCode: "SG",
	},
	{
		name: "Retool",
		domain: "retool.com",
		industry: "Software",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Deel",
		domain: "deel.com",
		industry: "Human Resources",
		city: "New York",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Mercury",
		domain: "mercury.com",
		industry: "Banking",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Attio",
		domain: "attio.com",
		industry: "Software",
		city: "London",
		country: "United Kingdom",
		countryCode: "GB",
	},
];

const FIRST_NAMES = [
	"Amara",
	"Ben",
	"Chidi",
	"Dana",
	"Elias",
	"Farah",
	"Gus",
	"Hana",
	"Ines",
	"Jonas",
	"Kofi",
	"Lena",
	"Mateo",
	"Nadia",
	"Omar",
	"Pia",
	"Quinn",
	"Rosa",
	"Sami",
	"Tara",
	"Ugo",
	"Vera",
	"Wes",
	"Yuki",
] as const;

const LAST_NAMES = [
	"Adeyemi",
	"Bergström",
	"Chen",
	"Dubois",
	"Eriksen",
	"Fontaine",
	"Gupta",
	"Haddad",
	"Ivanova",
	"Jensen",
	"Kowalski",
	"Lombardi",
	"Moreau",
	"Nakamura",
	"Oyelaran",
	"Petrov",
	"Quintana",
	"Rossi",
	"Sørensen",
	"Takahashi",
] as const;

const TITLES = [
	"Head of Security",
	"CTO",
	"VP Engineering",
	"Compliance Manager",
	"Head of Legal",
	"Security Engineer",
	"COO",
	"IT Director",
	"Head of Platform",
	"Chief of Staff",
] as const;

const OPEN_STAGES = [
	DealStage.DEMO_BOOKED,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.DECISION_MAKER_BOUGHT_IN,
	DealStage.CONTRACT_SENT,
] as const;

const CLOSED_STAGES = [
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
] as const;

const DEAL_DESCRIPTIONS = [
	"Replacing a spreadsheet-and-Drive evidence process before their first SOC 2 audit. Security owns the decision, finance signs.",
	"Expansion onto the platform team after the security org went live. Blocked on whether the current contract can be co-termed.",
	"Inbound from a failed vendor renewal. They want automated evidence collection and one auditor-ready report.",
	"Their enterprise deals keep stalling on security questionnaires. The buying trigger is the pipeline, not the audit.",
	"Champion ran the evaluation themselves and wants the agent, not the checklist. Procurement is the long pole.",
] as const;

const LOST_REASONS = [
	"Went with an incumbent vendor",
	"No budget this cycle",
	"Timeline slipped to next year",
	"Not a fit — no compliance requirement yet",
] as const;

const NOTE_BODIES = [
	"Ran through the SOC 2 timeline. They want evidence collection automated before the audit window opens.",
	"Procurement wants a security questionnaire back before they will look at pricing.",
	"Champion is keen, but the budget owner has not been in a call yet.",
	"They are evaluating us against two others. Differentiator is the agent, not the checklist.",
	"Asked for a reference in the same vertical. Following up with marketing.",
	"Pushed the decision to after their board meeting.",
] as const;

const CALL_SUBJECTS = [
	"Discovery call",
	"Technical deep dive",
	"Pricing discussion",
	"Follow-up call",
	"Security review",
] as const;

const TASK_SUBJECTS = [
	"Send the security questionnaire",
	"Share pricing proposal",
	"Book the technical deep dive",
	"Chase procurement",
	"Send SOC 2 report",
	"Introduce the implementation team",
] as const;

const MEETING_SUBJECTS = [
	"Product demo",
	"Onboarding walkthrough",
	"Quarterly check-in",
	"Stakeholder alignment",
] as const;

const EMAIL_SUBJECTS = [
	"Re: next steps",
	"Following up after the demo",
	"Pricing and terms",
	"Intro to your implementation lead",
] as const;

const TRANSLITERATIONS: Record<string, string> = {
	ø: "o",
	æ: "ae",
	œ: "oe",
	å: "a",
	ß: "ss",
	đ: "d",
	ł: "l",
	þ: "th",
};

function slug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[øæœåßđłþ]/g, (char) => TRANSLITERATIONS[char] ?? char)
		.normalize("NFD")
		.replace(/\p{Mn}/gu, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

async function seedOwners(): Promise<string[]> {
	const existing = await db.user.findMany({ select: { id: true } });

	if (existing.length > 0) {
		console.log(`Using ${existing.length} existing user(s) as owners.`);
		return existing.map((user) => user.id);
	}

	console.log("No users yet — creating placeholder sales reps.");
	const created = await Promise.all(
		OWNERS.map((owner) =>
			db.user.upsert({
				where: { email: owner.email },
				create: {
					id: `seed-${slug(owner.name)}`,
					name: owner.name,
					email: owner.email,
					emailVerified: true,
					updatedAt: new Date(),
				},
				update: {},
				select: { id: true },
			}),
		),
	);

	return created.map((user) => user.id);
}

async function seedCompanies(
	ownerIds: string[],
): Promise<{ id: string; name: string; domain: string }[]> {
	const companies = [];

	for (const company of COMPANIES) {
		const row = await db.company.upsert({
			where: { domain: company.domain },
			create: {
				name: company.name,
				domain: company.domain,
				website: `https://${company.domain}`,
				industry: company.industry,
				city: company.city,
				country: company.country,
				countryCode: company.countryCode,
				ownerId: pick(ownerIds),
				createdAt: daysFromNow(-integer(30, 400), 12),
			},
			update: {},
			select: { id: true, name: true, domain: true, iconUrl: true },
		});
		companies.push({ ...row, domain: row.domain ?? company.domain });
	}

	await seedIcons(companies);

	return companies.map(({ iconUrl: _, ...company }) => company);
}

async function seedIcons(
	companies: { id: string; domain: string | null; iconUrl: string | null }[],
): Promise<void> {
	const missing = companies.filter(
		(company) => company.iconUrl === null && company.domain,
	);
	if (missing.length === 0) return;

	let resolved = 0;
	for (const company of missing) {
		const source = await resolveFavicon(company.domain);
		if (!source) continue;

		const iconUrl =
			(await mirror(source, `companies/${company.id}/icon`)) ?? source;

		await db.company.updateMany({
			where: { id: company.id, iconUrl: null },
			data: { iconUrl },
		});
		resolved += 1;
	}

	console.log(`Resolved ${resolved} of ${missing.length} company icons.`);
}

type SeededContact = { id: string; companyId: string };

async function seedContacts(
	companies: { id: string; domain: string }[],
	ownerIds: string[],
): Promise<SeededContact[]> {
	const contacts: SeededContact[] = [];
	const used = new Set<string>();

	for (const company of companies) {
		for (let index = 0; index < integer(2, 4); index++) {
			const firstName = pick(FIRST_NAMES);
			const lastName = pick(LAST_NAMES);
			const email = `${slug(firstName)}.${slug(lastName)}@${company.domain}`;
			if (used.has(email)) continue;
			used.add(email);

			const contact = await db.contact.upsert({
				where: { email },
				create: {
					firstName,
					lastName,
					email,
					title: pick(TITLES),
					phone: chance(0.4) ? `+1 415 555 ${integer(1000, 9999)}` : null,
					companyId: company.id,
					ownerId: pick(ownerIds),
					createdAt: daysFromNow(-integer(10, 300), 12),
				},
				update: {},
				select: { id: true },
			});

			contacts.push({ id: contact.id, companyId: company.id });
		}
	}

	for (const company of companies) {
		const first = contacts.find((contact) => contact.companyId === company.id);
		if (!first) continue;
		await db.company.update({
			where: { id: company.id },
			data: { primaryContactId: first.id },
		});
	}

	return contacts;
}

type SeededDeal = {
	id: string;
	companyId: string;
	ownerId: string;
	closed: boolean;
};

const SEED_RATES: Record<string, number> = {
	EUR: 1.09,
	GBP: 1.27,
	CAD: 0.73,
	AUD: 0.66,
	JPY: 0.0067,
};

const DEAL_CURRENCIES = ["USD", "USD", "USD", "EUR", "GBP", "JPY", "CAD"];

let seedBase = "USD";

async function seedRates(): Promise<number> {
	const asOf = daysFromNow(-1);

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: {
			id: SETTINGS_ID,
			reportingCurrency: DEFAULT_REPORTING_CURRENCY,
		},
		update: {},
		select: { id: true },
	});

	seedBase = await readReportingCurrency(db);

	if (seedBase !== "USD") {
		console.log(
			`Reporting currency is ${seedBase} — seeding a converted figure only for ` +
				`deals already in ${seedBase}; the rates cron converts the rest.`,
		);
	}

	for (const [quoteCurrency, rate] of Object.entries(SEED_RATES)) {
		await db.exchangeRate.upsert({
			where: {
				baseCurrency_quoteCurrency_source: {
					baseCurrency: "USD",
					quoteCurrency,
					source: RateSource.FETCHED,
				},
			},
			create: {
				baseCurrency: "USD",
				quoteCurrency,
				rate,
				asOf,
				source: RateSource.FETCHED,
				provider: "seed",
			},
			update: { rate, asOf, provider: "seed" },
		});
	}

	return Object.keys(SEED_RATES).length;
}

function money(usdAmount: number, currency: string) {
	const rate = SEED_RATES[currency] ?? 1;
	const places = currency === "JPY" ? 0 : 2;
	const amount = Number((usdAmount / rate).toFixed(places));

	const converted =
		currency === seedBase
			? { baseAmount: amount, fxRate: 1 }
			: seedBase === "USD"
				? { baseAmount: Number((amount * rate).toFixed(2)), fxRate: rate }
				: null;

	return {
		amount,
		currency,
		baseAmount: converted?.baseAmount ?? null,
		baseCurrency: converted ? seedBase : null,
		fxRate: converted?.fxRate ?? null,
	};
}

async function seedDeals(
	companies: { id: string; name: string }[],
	contacts: SeededContact[],
	ownerIds: string[],
): Promise<SeededDeal[]> {
	const deals: SeededDeal[] = [];

	for (const [index, company] of companies.entries()) {
		const count = index % 2 === 0 ? 2 : 1;

		for (let n = 0; n < count; n++) {
			const id = `seed-deal-${slug(company.name)}-${n}`;
			const closed = chance(0.35);
			const stage = closed ? pick(CLOSED_STAGES) : pick(OPEN_STAGES);
			const ownerId = pick(ownerIds);
			const createdDaysAgo = integer(20, 210);
			const createdAt = daysFromNow(-createdDaysAgo, 12);
			const closedDaysAgo = closed
				? integer(0, Math.max(createdDaysAgo - 14, 0))
				: null;
			const stageChangedAt = daysFromNow(
				closedDaysAgo === null ? -integer(1, 20) : -closedDaysAgo,
				12,
			);

			await db.deal.upsert({
				where: { id },
				create: {
					id,
					name:
						n === 0
							? `${company.name} — Comp AI`
							: `${company.name} — expansion`,
					description: pick(DEAL_DESCRIPTIONS),
					companyId: company.id,
					ownerId,
					stage,
					stageChangedAt,
					...(() => {
						const { amount, currency, baseAmount, baseCurrency, fxRate } =
							money(integer(6, 90) * 1000, pick(DEAL_CURRENCIES));
						return {
							amount,
							currency,
							baseAmount,
							baseCurrency,
							fxRate,
							fxRateAt: fxRate === null ? null : daysFromNow(-1),
						};
					})(),
					expectedCloseDate: daysFromNow(
						closedDaysAgo === null
							? integer(-10, 75)
							: -closedDaysAgo + integer(-4, 9),
					),
					closedAt: closed ? stageChangedAt : null,
					closedReason:
						stage === DealStage.CLOSED_LOST ||
						stage === DealStage.UNQUALIFIED_TO_BUY
							? pick(LOST_REASONS)
							: null,
					createdAt,
				},
				update: {},
			});

			const companyContacts = contacts.filter(
				(contact) => contact.companyId === company.id,
			);
			for (const contact of companyContacts.slice(0, integer(1, 2))) {
				await db.dealContact.upsert({
					where: { dealId_contactId: { dealId: id, contactId: contact.id } },
					create: {
						dealId: id,
						contactId: contact.id,
						role: chance(0.5) ? "Champion" : "Decision maker",
					},
					update: {},
				});
			}

			deals.push({ id, companyId: company.id, ownerId, closed });
		}
	}

	return deals;
}

async function seedActivities(
	companies: { id: string }[],
	contacts: SeededContact[],
	deals: SeededDeal[],
	ownerIds: string[],
): Promise<number> {
	const existing = await db.activity.count();
	if (existing > 0) {
		console.log(`Activities already seeded (${existing}) — skipping.`);
		return existing;
	}

	type ActivityRow = {
		type: ActivityType;
		subject: string | null;
		body: string | null;
		occurredAt: Date | null;
		dueAt: Date | null;
		completedAt: Date | null;
		companyId: string | null;
		contactId: string | null;
		dealId: string | null;
		createdById: string;
		createdAt: Date;
		meta?: { from: DealStage; to: DealStage };
	};

	const rows: ActivityRow[] = [];

	const base = (companyId: string, createdById: string, createdAt: Date) => ({
		companyId,
		contactId: null,
		dealId: null,
		occurredAt: null,
		dueAt: null,
		completedAt: null,
		subject: null,
		body: null,
		createdById,
		createdAt,
	});

	for (const deal of deals) {
		const dealContacts = contacts.filter((c) => c.companyId === deal.companyId);

		for (let n = 0; n < integer(3, 6); n++) {
			const at = daysFromNow(-integer(2, 120), 18);
			const type = pick([
				ActivityType.NOTE,
				ActivityType.CALL,
				ActivityType.EMAIL,
				ActivityType.MEETING,
			]);

			rows.push({
				...base(deal.companyId, deal.ownerId, at),
				type,
				dealId: deal.id,
				contactId: dealContacts.length > 0 ? pick(dealContacts).id : null,
				subject:
					type === ActivityType.CALL
						? pick(CALL_SUBJECTS)
						: type === ActivityType.MEETING
							? pick(MEETING_SUBJECTS)
							: type === ActivityType.EMAIL
								? pick(EMAIL_SUBJECTS)
								: null,
				body: type === ActivityType.NOTE ? pick(NOTE_BODIES) : null,
				occurredAt: type === ActivityType.NOTE ? null : at,
			});
		}

		rows.push({
			...base(deal.companyId, deal.ownerId, daysFromNow(-integer(1, 20), 12)),
			type: ActivityType.STAGE_CHANGE,
			dealId: deal.id,
			subject: "Stage changed",
			meta: {
				from: DealStage.DEMO_BOOKED,
				to: deal.closed ? DealStage.CLOSED_WON : DealStage.QUALIFIED_TO_BUY,
			},
		});
	}

	for (const deal of deals) {
		if (deal.closed) continue;

		for (let n = 0; n < integer(1, 3); n++) {
			const roll = random();
			const overdue = roll < 0.3;
			const done = roll >= 0.3 && roll < 0.6;
			const dueAt = overdue
				? daysFromNow(-integer(1, 14), 6)
				: daysFromNow(integer(1, 21), 6);

			rows.push({
				...base(deal.companyId, deal.ownerId, daysFromNow(-integer(1, 30), 12)),
				type: ActivityType.TASK,
				dealId: deal.id,
				subject: pick(TASK_SUBJECTS),
				dueAt: done ? daysFromNow(-integer(1, 20), 6) : dueAt,
				completedAt: done ? daysFromNow(-integer(1, 10), 6) : null,
			});
		}
	}

	for (const company of companies) {
		if (!chance(0.6)) continue;
		rows.push({
			...base(company.id, pick(ownerIds), daysFromNow(-integer(5, 200), 12)),
			type: ActivityType.NOTE,
			body: pick(NOTE_BODIES),
		});
	}

	await db.activity.createMany({ data: rows });
	return rows.length;
}

async function seedMarketing(): Promise<number> {
	await ensureDefaultSegments(db);

	const existing = await db.marketingPartial.count();
	if (existing > 0) return 0;

	const header = await db.marketingPartial.create({
		data: {
			kind: "HEADER",
			name: "Default header",
			isDefault: true,
			document: { version: 1, blocks: [] },
		},
		select: { id: true },
	});

	const footer = await db.marketingPartial.create({
		data: {
			kind: "FOOTER",
			name: "Default footer",
			isDefault: true,
			document: {
				version: 1,
				blocks: [
					{
						type: "text",
						text: [
							{
								text: "You are getting this because you asked us about {{workspace.name|our product}}.",
							},
						],
					},
				],
			},
		},
		select: { id: true },
	});

	const templates = [
		{
			name: "Product announcement",
			subject: "Continuous monitoring is here",
			preheader: "No setup. It is already running on the frameworks you use.",
			document: {
				version: 1,
				blocks: [
					{
						type: "heading",
						level: 1,
						text: [{ text: "Continuous monitoring is here" }],
					},
					{
						type: "text",
						text: [
							{
								text: "Hi {{contact.firstName|there}} — every control in your framework is now checked on a schedule, and anything that drifts opens a task the same day.",
							},
						],
					},
					{
						type: "button",
						label: "Read the changelog",
						href: "https://example.com/changelog",
					},
				],
			},
		},
		{
			name: "Plain letter",
			subject: "A quick question",
			preheader: "Two minutes, and no pitch.",
			document: {
				version: 1,
				blocks: [
					{
						type: "text",
						text: [{ text: "Hi {{contact.firstName|there}}," }],
					},
					{
						type: "text",
						text: [
							{
								text: "You had a look at our pricing this week, so I thought I would save you the guesswork.",
							},
						],
					},
					{ type: "text", text: [{ text: "— {{sender.name|the team}}" }] },
				],
			},
		},
	];

	for (const template of templates) {
		await db.marketingTemplate.create({
			data: { ...template, headerId: header.id, footerId: footer.id },
		});
	}

	return templates.length;
}

async function main() {
	const rates = await seedRates();
	const ownerIds = await seedOwners();
	const companies = await seedCompanies(ownerIds);
	const contacts = await seedContacts(companies, ownerIds);
	const deals = await seedDeals(companies, contacts, ownerIds);
	const activities = await seedActivities(companies, contacts, deals, ownerIds);
	const templates = await seedMarketing();

	console.log(
		`Seeded ${companies.length} companies, ${contacts.length} contacts, ` +
			`${deals.length} deals, ${activities} activities, ${rates} exchange rates, ` +
			`${templates} email templates.`,
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.$disconnect();
	});
