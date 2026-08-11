import { ActivityType, type Db, db, Prisma, RecordSource } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { z } from "zod";
import { scheduleTask } from "./tasks";

const API_URL = "https://public-api.granola.ai";
const PAGE_SIZE = 30;
const OVERLAP_MS = 5 * 60_000;
const REQUEST_INTERVAL_MS = 220;

const personSchema = z
	.object({
		name: z.string().nullable().optional(),
		email: z.string().email(),
	})
	.passthrough();

const folderSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		parent_folder_id: z.string().nullable().optional(),
		space_id: z.string().nullable().optional(),
	})
	.passthrough();

const calendarEventSchema = z
	.object({
		event_title: z.string().nullable().optional(),
		invitees: z.array(personSchema).default([]),
		organiser: z.string().nullable().optional(),
		calendar_event_id: z.string().nullable().optional(),
		scheduled_start_time: z
			.string()
			.datetime({ offset: true })
			.nullable()
			.optional(),
		scheduled_end_time: z
			.string()
			.datetime({ offset: true })
			.nullable()
			.optional(),
	})
	.passthrough();

const transcriptSchema = z.array(
	z
		.object({
			text: z.string(),
			start_time: z.string().nullable().optional(),
			end_time: z.string().nullable().optional(),
			speaker: z
				.object({
					source: z.string().nullable().optional(),
					attribution: z
						.union([
							z.string(),
							z.object({
								name: z.string().nullable().optional(),
								email: z.string().nullable().optional(),
							}),
						])
						.nullable()
						.optional(),
				})
				.nullable()
				.optional(),
		})
		.passthrough(),
);

const listNoteSchema = z
	.object({
		id: z.string().startsWith("not_"),
		title: z
			.string()
			.nullable()
			.transform((value) => value?.trim() || "Untitled meeting"),
		created_at: z.string().datetime({ offset: true }),
		updated_at: z.string().datetime({ offset: true }),
	})
	.passthrough();

const listSchema = z.object({
	notes: z.array(listNoteSchema),
	hasMore: z.boolean(),
	cursor: z.string().nullable().optional(),
});

const noteSchema = listNoteSchema.extend({
	web_url: z.string().url().nullable().optional(),
	owner: personSchema.nullable().optional(),
	calendar_event: calendarEventSchema.nullable().optional(),
	attendees: z.array(personSchema).default([]),
	folder_membership: z.array(folderSchema).default([]),
	summary_text: z.string().nullable().optional(),
	summary_markdown: z.string().nullable().optional(),
	transcript: transcriptSchema.nullable().optional(),
});

export type GranolaNoteInput = z.infer<typeof noteSchema>;

export type GranolaSyncOutcome = {
	status: "synced" | "skipped";
	imported: number;
	updated: number;
	unchanged: number;
	matched: number;
	unmatched: number;
	reason?: string;
};

type Match = {
	companyId: string | null;
	contactId: string | null;
	dealId: string | null;
	newCompanyId: string | null;
	newContactIds: string[];
};

type ImportResult = {
	created: boolean;
	matched: boolean;
	companyId: string | null;
	newCompanyId: string | null;
	newContactIds: string[];
};

type ParticipantRules = {
	internalAddresses: ReadonlySet<string>;
	internalDomains: ReadonlySet<string>;
	suppressedAddresses: ReadonlySet<string>;
	suppressedDomains: ReadonlySet<string>;
	folderDomains: ReadonlyMap<string, string>;
};

class GranolaHttpError extends Error {
	constructor(readonly status: number) {
		super(`Granola returned ${status}.`);
	}
}

export async function runGranolaSync(
	database: Db = db,
	request: typeof fetch = fetch,
	requestIntervalMs = REQUEST_INTERVAL_MS,
): Promise<GranolaSyncOutcome> {
	const apiKey = process.env.GRANOLA_API_KEY?.trim();
	if (!apiKey) {
		return {
			status: "skipped",
			imported: 0,
			updated: 0,
			unchanged: 0,
			matched: 0,
			unmatched: 0,
			reason: "Granola access is not configured.",
		};
	}

	const latest = await database.granolaNote.findFirst({
		orderBy: { sourceUpdatedAt: "desc" },
		select: { sourceUpdatedAt: true },
	});
	const after = latest
		? new Date(latest.sourceUpdatedAt.getTime() - OVERLAP_MS)
		: null;
	const participantRules = await readParticipantRules(database);
	if (
		participantRules.internalAddresses.size === 0 &&
		participantRules.internalDomains.size === 0
	) {
		return {
			status: "skipped",
			imported: 0,
			updated: 0,
			unchanged: 0,
			matched: 0,
			unmatched: 0,
			reason:
				"Workspace identity is not configured, so internal attendees cannot be identified safely.",
		};
	}
	const excluded = new Set(
		(
			await database.granolaNoteExclusion.findMany({
				select: { externalId: true },
			})
		).map((row) => row.externalId),
	);
	const client = pacedClient(apiKey, request, requestIntervalMs);
	let cursor: string | null = null;
	const cursors = new Set<string>();
	let imported = 0;
	let updated = 0;
	let unchanged = 0;
	let matched = 0;
	let unmatched = 0;

	for (;;) {
		const url = new URL("/v1/notes", API_URL);
		url.searchParams.set("page_size", String(PAGE_SIZE));
		if (after) url.searchParams.set("updated_after", after.toISOString());
		if (cursor) url.searchParams.set("cursor", cursor);

		const page = listSchema.parse(await client(url));
		for (const summary of page.notes) {
			if (excluded.has(summary.id)) {
				unchanged += 1;
				continue;
			}
			const existing = await database.granolaNote.findUnique({
				where: { externalId: summary.id },
				select: { sourceUpdatedAt: true },
			});
			if (
				existing &&
				existing.sourceUpdatedAt >= new Date(summary.updated_at)
			) {
				unchanged += 1;
				continue;
			}

			const detailUrl = new URL(`/v1/notes/${summary.id}`, API_URL);
			detailUrl.searchParams.set("include", "transcript");
			let detail: unknown;
			try {
				detail = await client(detailUrl);
			} catch (error) {
				if (error instanceof GranolaHttpError && error.status === 404) {
					unchanged += 1;
					continue;
				}
				throw error;
			}
			const note = noteSchema.parse(detail);
			const result = await importGranolaNote(note, participantRules, database);
			if (result.created) imported += 1;
			else updated += 1;
			if (result.matched) matched += 1;
			else unmatched += 1;
			await queueEnrichment(result);
		}

		if (!page.hasMore || !page.cursor) break;
		if (cursors.has(page.cursor))
			throw new Error("Granola repeated its cursor.");
		cursors.add(page.cursor);
		cursor = page.cursor;
	}

	return {
		status: "synced",
		imported,
		updated,
		unchanged,
		matched,
		unmatched,
	};
}

export async function importGranolaNote(
	input: GranolaNoteInput,
	participantRules: ParticipantRules | ReadonlySet<string>,
	database: Db = db,
): Promise<ImportResult> {
	const note = noteSchema.parse(input);
	const participants = people(note);
	const rules = participantRuleSet(participantRules);
	const external = participants.filter((person) =>
		externalPerson(person, rules),
	);

	return database.$transaction(async (tx) => {
		const lockKey = clean(note.calendar_event?.calendar_event_id) ?? note.id;
		await tx.$executeRaw(
			Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`granola:${lockKey}`}, 0))`,
		);
		const excluded = await tx.granolaNoteExclusion.findUnique({
			where: { externalId: note.id },
			select: { externalId: true },
		});
		if (excluded) {
			return {
				created: false,
				matched: false,
				companyId: null,
				newCompanyId: null,
				newContactIds: [],
			};
		}
		const previous = await tx.granolaNote.findUnique({
			where: { externalId: note.id },
			select: {
				id: true,
				activityId: true,
				companyId: true,
				contactId: true,
				dealId: true,
			},
		});
		const match = await matchNote(note, external, rules.folderDomains, tx);
		const companyId = match.companyId ?? previous?.companyId ?? null;
		const contactId = match.contactId ?? previous?.contactId ?? null;
		const dealId = match.dealId ?? previous?.dealId ?? null;
		const startedAt =
			date(note.calendar_event?.scheduled_start_time) ??
			new Date(note.created_at);
		const endedAt = date(note.calendar_event?.scheduled_end_time);
		const summary = clean(note.summary_markdown) ?? clean(note.summary_text);
		const activityId = await activityForNote({
			note,
			previousActivityId: previous?.activityId ?? null,
			companyId,
			contactId,
			dealId,
			startedAt,
			summary,
			database: tx,
		});

		await tx.granolaNote.upsert({
			where: { externalId: note.id },
			create: {
				externalId: note.id,
				title: note.title,
				sourceUrl: clean(note.web_url),
				ownerName: clean(note.owner?.name),
				ownerEmail: clean(note.owner?.email)?.toLowerCase() ?? null,
				summary,
				transcript: json(note.transcript),
				attendees: json(participants),
				folders: json(note.folder_membership),
				calendarEventExternalId: clean(note.calendar_event?.calendar_event_id),
				startedAt,
				endedAt,
				sourceCreatedAt: new Date(note.created_at),
				sourceUpdatedAt: new Date(note.updated_at),
				companyId,
				contactId,
				dealId,
				activityId,
			},
			update: {
				title: note.title,
				sourceUrl: clean(note.web_url),
				ownerName: clean(note.owner?.name),
				ownerEmail: clean(note.owner?.email)?.toLowerCase() ?? null,
				summary,
				transcript: json(note.transcript),
				attendees: json(participants),
				folders: json(note.folder_membership),
				calendarEventExternalId: clean(note.calendar_event?.calendar_event_id),
				startedAt,
				endedAt,
				sourceUpdatedAt: new Date(note.updated_at),
				companyId,
				contactId,
				dealId,
				activityId,
			},
		});
		await stampLastActivity(
			{ companyId, contactId, dealId, occurredAt: startedAt },
			tx,
		);

		return {
			created: previous === null,
			matched: companyId !== null || contactId !== null,
			companyId,
			newCompanyId: match.newCompanyId,
			newContactIds: match.newContactIds,
		};
	});
}

export async function excludeGranolaNotes(
	externalIds: readonly string[],
	reason: string,
	database: Db = db,
): Promise<{
	excluded: number;
	deletedNotes: number;
	deletedActivities: number;
}> {
	const ids = [...new Set(externalIds.map((id) => id.trim()).filter(Boolean))];
	if (ids.length === 0) {
		return { excluded: 0, deletedNotes: 0, deletedActivities: 0 };
	}

	return database.$transaction(async (tx) => {
		const notes = await tx.granolaNote.findMany({
			where: { externalId: { in: ids } },
			select: { activityId: true },
		});
		const exclusions = await tx.granolaNoteExclusion.createMany({
			data: ids.map((externalId) => ({ externalId, reason })),
			skipDuplicates: true,
		});
		const deletedNotes = await tx.granolaNote.deleteMany({
			where: { externalId: { in: ids } },
		});
		const activityIds = notes.flatMap((note) =>
			note.activityId ? [note.activityId] : [],
		);
		const deletedActivities = await tx.activity.deleteMany({
			where: {
				id: { in: activityIds },
				granolaNotes: { none: {} },
				emailThreadId: null,
				calendarEventId: null,
			},
		});

		return {
			excluded: exclusions.count,
			deletedNotes: deletedNotes.count,
			deletedActivities: deletedActivities.count,
		};
	});
}

function participantRuleSet(
	input: ParticipantRules | ReadonlySet<string>,
): ParticipantRules {
	if ("internalAddresses" in input) return input;
	return {
		internalAddresses: new Set<string>(),
		internalDomains: input,
		suppressedAddresses: new Set<string>(),
		suppressedDomains: new Set<string>(),
		folderDomains: new Map<string, string>(),
	};
}

async function matchNote(
	note: GranolaNoteInput,
	external: ReturnType<typeof people>,
	folderDomains: ReadonlyMap<string, string>,
	database: Prisma.TransactionClient,
): Promise<Match> {
	const calendarEventId = clean(note.calendar_event?.calendar_event_id);
	if (calendarEventId) {
		const event = await database.calendarEvent.findFirst({
			where: { googleEventId: calendarEventId },
			select: { companyId: true, contactId: true },
		});
		if (event?.companyId || event?.contactId) {
			return {
				companyId: event.companyId,
				contactId: event.contactId,
				dealId: await singleDeal(event.companyId, database),
				newCompanyId: null,
				newContactIds: [],
			};
		}
	}

	const folderName = customerFolder(note.folder_membership);
	const mappedDomain = folderName
		? (folderDomains.get(folderName.toLowerCase()) ?? null)
		: null;
	const externalDomains = new Set(
		external
			.map((person) => workDomain(person.email))
			.filter((value): value is string => value !== null),
	);
	const domain =
		mappedDomain ??
		(externalDomains.size === 1 ? ([...externalDomains][0] ?? null) : null);
	if (!domain) {
		return {
			companyId: null,
			contactId: null,
			dealId: null,
			newCompanyId: null,
			newContactIds: [],
		};
	}

	let company = await database.company.findUnique({
		where: { domain },
		select: { id: true, name: true, source: true },
	});
	if (!company && folderName) {
		company = await database.company.findFirst({
			where: {
				name: { equals: folderName, mode: "insensitive" },
				domain,
			},
			select: { id: true, name: true, source: true },
		});
	}

	let newCompanyId: string | null = null;
	if (!company && domain) {
		const owner = await database.user.findFirst({
			orderBy: { createdAt: "asc" },
			select: { id: true },
		});
		const created = await database.company.create({
			data: {
				name: folderName ?? companyNameFromDomain(domain),
				domain,
				website: `https://${domain}`,
				ownerId: owner?.id,
				source: RecordSource.GRANOLA,
			},
			select: { id: true, name: true, source: true },
		});
		company = created;
		newCompanyId = created.id;
	} else if (company && domain) {
		await database.company.updateMany({
			where: { id: company.id, domain: null },
			data: { domain, website: `https://${domain}` },
		});
	}
	if (
		company &&
		folderName &&
		domain &&
		company.source === RecordSource.GRANOLA &&
		company.name === companyNameFromDomain(domain)
	) {
		await database.company.update({
			where: { id: company.id },
			data: { name: folderName },
		});
		company = { ...company, name: folderName };
	}

	const newContactIds: string[] = [];
	let contactId: string | null = null;
	for (const person of external.filter(
		(person) => workDomain(person.email) === domain,
	)) {
		const existing = await database.contact.findFirst({
			where: { email: { equals: person.email, mode: "insensitive" } },
			select: { id: true, companyId: true },
		});
		if (existing) {
			if (company && !existing.companyId) {
				await database.contact.update({
					where: { id: existing.id },
					data: { companyId: company.id },
				});
			}
			contactId ??= existing.id;
			continue;
		}

		const owner = await database.user.findFirst({
			orderBy: { createdAt: "asc" },
			select: { id: true },
		});
		const name = splitName(person.name, person.email);
		const contact = await database.contact.create({
			data: {
				firstName: name.firstName,
				lastName: name.lastName,
				email: person.email,
				companyId: company?.id ?? null,
				ownerId: owner?.id,
				source: RecordSource.GRANOLA,
			},
			select: { id: true },
		});
		contactId ??= contact.id;
		newContactIds.push(contact.id);
	}

	return {
		companyId: company?.id ?? null,
		contactId,
		dealId: await singleDeal(company?.id ?? null, database),
		newCompanyId,
		newContactIds,
	};
}

async function activityForNote(input: {
	note: GranolaNoteInput;
	previousActivityId: string | null;
	companyId: string | null;
	contactId: string | null;
	dealId: string | null;
	startedAt: Date;
	summary: string | null;
	database: Prisma.TransactionClient;
}): Promise<string | null> {
	let activityId = input.previousActivityId;
	const calendarEventId = clean(input.note.calendar_event?.calendar_event_id);
	if (!activityId && calendarEventId) {
		const calendar = await input.database.calendarEvent.findFirst({
			where: { googleEventId: calendarEventId },
			select: { activity: { select: { id: true } } },
		});
		activityId = calendar?.activity?.id ?? null;
	}
	if (!activityId && calendarEventId) {
		const sibling = await input.database.granolaNote.findFirst({
			where: {
				calendarEventExternalId: calendarEventId,
				activityId: { not: null },
			},
			select: { activityId: true },
		});
		activityId = sibling?.activityId ?? null;
	}

	if (activityId) {
		await input.database.activity.update({
			where: { id: activityId },
			data: {
				subject: input.note.title,
				body: summarySnippet(input.summary),
				occurredAt: input.startedAt,
				companyId: input.companyId ?? undefined,
				contactId: input.contactId ?? undefined,
				dealId: input.dealId ?? undefined,
			},
		});
		return activityId;
	}

	const user =
		(await input.database.user.findFirst({
			where: input.note.owner?.email
				? { email: { equals: input.note.owner.email, mode: "insensitive" } }
				: undefined,
			select: { id: true },
		})) ??
		(await input.database.user.findFirst({
			orderBy: { createdAt: "asc" },
			select: { id: true },
		}));
	if (!user) return null;

	const created = await input.database.activity.create({
		data: {
			type: ActivityType.MEETING,
			subject: input.note.title,
			body: summarySnippet(input.summary),
			occurredAt: input.startedAt,
			companyId: input.companyId,
			contactId: input.contactId,
			dealId: input.dealId,
			createdById: user.id,
			meta: {
				synced: true,
				source: "granola",
			} satisfies Prisma.InputJsonObject,
		},
		select: { id: true },
	});
	return created.id;
}

async function stampLastActivity(
	input: {
		companyId: string | null;
		contactId: string | null;
		dealId: string | null;
		occurredAt: Date;
	},
	database: Prisma.TransactionClient,
): Promise<void> {
	const newerThan = {
		OR: [
			{ lastActivityAt: null },
			{ lastActivityAt: { lt: input.occurredAt } },
		],
	};
	await Promise.all([
		input.companyId
			? database.company.updateMany({
					where: { id: input.companyId, ...newerThan },
					data: { lastActivityAt: input.occurredAt },
				})
			: Promise.resolve(),
		input.contactId
			? database.contact.updateMany({
					where: { id: input.contactId, ...newerThan },
					data: { lastActivityAt: input.occurredAt },
				})
			: Promise.resolve(),
		input.dealId
			? database.deal.updateMany({
					where: { id: input.dealId, ...newerThan },
					data: { lastActivityAt: input.occurredAt },
				})
			: Promise.resolve(),
	]);
}

async function singleDeal(
	companyId: string | null,
	database: Prisma.TransactionClient,
): Promise<string | null> {
	if (!companyId) return null;
	const deals = await database.deal.findMany({
		where: { companyId, closedAt: null },
		orderBy: { updatedAt: "desc" },
		take: 2,
		select: { id: true },
	});
	return deals.length === 1 ? (deals[0]?.id ?? null) : null;
}

async function readParticipantRules(database: Db): Promise<ParticipantRules> {
	const [users, organizations, suppressedDomains, suppressedAddresses] =
		await Promise.all([
			database.user.findMany({ select: { email: true } }),
			database.organization.findMany({ select: { website: true } }),
			database.suppressedDomain.findMany({ select: { domain: true } }),
			database.suppressedContact.findMany({ select: { email: true } }),
		]);
	const internalAddresses = new Set(
		users.map((user) => user.email.trim().toLowerCase()),
	);
	const internalDomains = new Set(
		users
			.map((user) => domainOf(user.email))
			.filter((value): value is string => value !== null),
	);
	for (const entry of process.env.ALLOWED_SIGN_IN?.split(",") ?? []) {
		const value = entry.trim().toLowerCase();
		const domain = value.includes("@") ? domainOf(value) : value;
		if (value.includes("@")) internalAddresses.add(value);
		if (domain) internalDomains.add(domain);
	}
	for (const organization of organizations) {
		const domain = websiteDomain(organization.website);
		if (domain) internalDomains.add(domain);
	}
	return {
		internalAddresses,
		internalDomains,
		suppressedAddresses: new Set(
			suppressedAddresses.map((row) => row.email.trim().toLowerCase()),
		),
		suppressedDomains: new Set(
			suppressedDomains.map((row) => row.domain.trim().toLowerCase()),
		),
		folderDomains: configuredFolderDomains(),
	};
}

function configuredFolderDomains(): ReadonlyMap<string, string> {
	const raw = process.env.GRANOLA_FOLDER_DOMAIN_MAP?.trim();
	if (!raw) return new Map();
	try {
		const parsed = z.record(z.string(), z.string()).safeParse(JSON.parse(raw));
		if (!parsed.success) return new Map();
		return new Map(
			Object.entries(parsed.data).flatMap(([folder, value]) => {
				const domain = websiteDomain(value);
				return folder.trim() && domain
					? [[folder.trim().toLowerCase(), domain] as const]
					: [];
			}),
		);
	} catch {
		return new Map();
	}
}

function websiteDomain(value: string | null | undefined): string | null {
	const input = clean(value);
	if (!input) return null;
	try {
		return new URL(input.includes("://") ? input : `https://${input}`).hostname
			.toLowerCase()
			.replace(/^www\./, "");
	} catch {
		return null;
	}
}

function externalPerson(
	person: { email: string },
	rules: ParticipantRules,
): boolean {
	const email = person.email.trim().toLowerCase();
	if (
		rules.internalAddresses.has(email) ||
		rules.suppressedAddresses.has(email) ||
		isAutomatedAddress(email) ||
		isMachineAddress(email)
	)
		return false;
	const domain = workDomain(email);
	return Boolean(
		domain &&
			!rules.internalDomains.has(domain) &&
			!rules.suppressedDomains.has(domain),
	);
}

function isAutomatedAddress(email: string): boolean {
	const local = email.split("@")[0]?.toLowerCase() ?? "";
	return AUTOMATED_LOCAL_PARTS.some(
		(pattern) =>
			local === pattern ||
			local.startsWith(`${pattern}-`) ||
			local.startsWith(`${pattern}+`) ||
			local.startsWith(`${pattern}_`),
	);
}

function isMachineAddress(email: string): boolean {
	const local = email.split("@")[0]?.toLowerCase() ?? "";
	return OPAQUE_LOCAL_PARTS.some((pattern) => pattern.test(local));
}

function people(note: GranolaNoteInput) {
	const byEmail = new Map<string, { name: string | null; email: string }>();
	for (const person of [
		...note.attendees,
		...(note.calendar_event?.invitees ?? []),
	]) {
		const email = person.email.trim().toLowerCase();
		if (!email) continue;
		const current = byEmail.get(email);
		byEmail.set(email, {
			email,
			name: clean(person.name) ?? current?.name ?? null,
		});
	}
	return [...byEmail.values()];
}

function customerFolder(folders: GranolaNoteInput["folder_membership"]) {
	const folder = folders.find(
		(candidate) => !GENERIC_FOLDERS.has(candidate.name.trim().toLowerCase()),
	);
	return clean(folder?.name);
}

function workDomain(email: string): string | null {
	const domain = domainOf(email);
	if (!domain || FREE_MAIL.has(domain) || MACHINE_DOMAINS.has(domain))
		return null;
	return domain;
}

function domainOf(email: string): string | null {
	const domain = email.trim().toLowerCase().split("@")[1];
	return domain || null;
}

function companyNameFromDomain(domain: string): string {
	const label = domain.split(".")[0] ?? domain;
	return label
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function splitName(
	value: string | null | undefined,
	email: string,
): { firstName: string; lastName: string | null } {
	const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];
	if (parts.length === 0) {
		return {
			firstName: email.split("@")[0] || "Granola attendee",
			lastName: null,
		};
	}
	return {
		firstName: parts[0] ?? "Granola attendee",
		lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
	};
}

function summarySnippet(value: string | null): string | null {
	if (!value) return null;
	const compact = value.replace(/\s+/g, " ").trim();
	return compact.length > 600 ? `${compact.slice(0, 597)}…` : compact;
}

function clean(value: string | null | undefined): string | null {
	const result = value?.trim();
	return result ? result : null;
}

function date(value: string | null | undefined): Date | null {
	return value ? new Date(value) : null;
}

function json(value: unknown): Prisma.InputJsonValue {
	if (value === undefined || value === null) return [];
	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function queueEnrichment(result: ImportResult): Promise<void> {
	const now = new Date();
	const tasks: Promise<{ id: string }>[] = [];
	if (result.newCompanyId) {
		tasks.push(
			scheduleTask({
				companyId: result.newCompanyId,
				kind: "brand",
				reason: "Company appeared in a Granola customer call",
				dueAt: now,
				priority: PRIORITY.brand,
				budget: 2,
			}),
			scheduleTask({
				companyId: result.newCompanyId,
				kind: "company-profile",
				reason: "Enrich a company found in a Granola customer call",
				dueAt: now,
				priority: PRIORITY.requested,
				budget: 8,
			}),
		);
	}
	for (const contactId of result.newContactIds) {
		tasks.push(
			scheduleTask({
				contactId,
				kind: "identify",
				reason: "Enrich a person found in a Granola customer call",
				dueAt: now,
				priority: PRIORITY.requested,
				budget: 8,
			}),
		);
	}
	await Promise.all(tasks);
}

function pacedClient(
	apiKey: string,
	request: typeof fetch,
	intervalMs: number,
): (url: URL) => Promise<unknown> {
	let lastRequestAt = 0;
	return async (url) => {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const waitFor = intervalMs - (Date.now() - lastRequestAt);
			if (waitFor > 0) await delay(waitFor);
			lastRequestAt = Date.now();
			const response = await request(url, {
				headers: { authorization: `Bearer ${apiKey}` },
				signal: AbortSignal.timeout(20_000),
			});
			if (response.status === 429 && attempt < 2) {
				await delay(1_000 * (attempt + 1));
				continue;
			}
			if (!response.ok) {
				throw new GranolaHttpError(response.status);
			}
			return response.json();
		}
		throw new Error("Granola rate limit did not clear.");
	};
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const GENERIC_FOLDERS = new Set([
	"customer calls",
	"customers",
	"team meetings",
	"team",
	"sales calls",
]);

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

const MACHINE_DOMAINS = new Set([
	"calendar.google.com",
	"googlegroups.com",
	"docs.google.com",
	"drive.google.com",
	"appspotmail.com",
	"amazonses.com",
	"sendgrid.net",
	"zoomcrc.com",
]);

const AUTOMATED_LOCAL_PARTS = [
	"noreply",
	"no-reply",
	"donotreply",
	"do-not-reply",
	"notifications",
	"notification",
	"mailer-daemon",
	"postmaster",
	"bounce",
	"bounces",
	"auto-confirm",
	"automated",
	"calendar-invite",
	"calendar",
	"invite",
	"invites",
	"invitations",
	"meetings",
	"scheduling",
	"booking",
	"bookings",
	"reply",
	"support",
	"help",
	"hello",
	"info",
	"contact",
	"sales",
	"billing",
	"accounts",
	"team",
];

const OPAQUE_LOCAL_PARTS = [
	/^(c_)?[0-9a-f]{24,}$/,
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
];
