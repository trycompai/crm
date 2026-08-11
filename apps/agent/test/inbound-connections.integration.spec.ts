import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailProvider } from "@crm/db";
import { DIRECT_KINDS } from "@crm/db/agent-tasks";
import { readCompanyHistory } from "../agent/lib/accounts";
import {
	type AgentMailMessage,
	importAgentMailMessage,
	runAgentMailSync,
} from "../agent/lib/agentmail-sync";
import {
	excludeGranolaNotes,
	type GranolaNoteInput,
	importGranolaNote,
	runGranolaSync,
} from "../agent/lib/granola-sync";
import {
	importWebsiteLeads,
	isWebsiteTestLead,
	type WebsiteLead,
} from "../agent/lib/website-intake";

const suffix = `${process.env.TEST_RUN_ID ?? "inbound"}-${crypto.randomUUID()}`;
const userId = `inbound-user-${suffix}`;
const websiteExternalId = crypto.randomUUID();
const websiteQaExternalId = crypto.randomUUID();
const websiteDomain = `website-${suffix}.example.test`;
const agentMailDomain = `agentmail-${suffix}.example.test`;
const agentMailInboxId = `inbox-${suffix}`;
const agentMailSyncInboxId = `sync-inbox-${suffix}`;
const agentMailMessageId = `message-${suffix}`;
const agentMailThreadId = `thread-${suffix}`;
const granolaExternalId = `not_${crypto.randomUUID().replaceAll("-", "").slice(0, 14)}`;
const excludedGranolaExternalId = `not_${crypto.randomUUID().replaceAll("-", "").slice(0, 14)}`;
const granolaDomain = `granola-${suffix}.example.test`;

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Inbound Test",
			email: `${userId}@example.test`,
		},
	});
});

afterAll(async () => {
	await db.emailInbox.deleteMany({
		where: {
			provider: EmailProvider.AGENTMAIL,
			externalInboxId: agentMailSyncInboxId,
		},
	});
	await db.granolaNoteExclusion.deleteMany({
		where: { externalId: excludedGranolaExternalId },
	});
	const granola = await db.granolaNote.findUnique({
		where: { externalId: granolaExternalId },
		select: { companyId: true, contactId: true, activityId: true },
	});
	if (granola?.activityId) {
		await db.activity.deleteMany({ where: { id: granola.activityId } });
	}
	await db.granolaNote.deleteMany({
		where: { externalId: granolaExternalId },
	});
	await db.agentTask.deleteMany({
		where: {
			OR: [
				{ companyId: granola?.companyId ?? "missing" },
				{ contactId: granola?.contactId ?? "missing" },
			],
		},
	});
	await db.contact.deleteMany({ where: { email: `charlie@${granolaDomain}` } });
	await db.company.deleteMany({ where: { domain: granolaDomain } });

	const enquiries = await db.websiteEnquiry.findMany({
		where: { externalId: { in: [websiteExternalId, websiteQaExternalId] } },
		select: { companyId: true, contactId: true },
	});
	const companyIds = enquiries.flatMap((row) =>
		row.companyId ? [row.companyId] : [],
	);
	const contactIds = enquiries.flatMap((row) =>
		row.contactId ? [row.contactId] : [],
	);

	await db.agentTask.deleteMany({
		where: {
			OR: [
				{ companyId: { in: companyIds } },
				{ contactId: { in: contactIds } },
			],
		},
	});
	await db.websiteEnquiry.deleteMany({
		where: { externalId: { in: [websiteExternalId, websiteQaExternalId] } },
	});
	await db.emailThread.deleteMany({
		where: {
			provider: EmailProvider.AGENTMAIL,
			externalThreadId: agentMailThreadId,
		},
	});
	await db.emailProviderEvent.deleteMany({
		where: {
			provider: EmailProvider.AGENTMAIL,
			externalEventId: `poll:${agentMailMessageId}`,
		},
	});
	await db.emailInbox.deleteMany({
		where: {
			provider: EmailProvider.AGENTMAIL,
			externalInboxId: agentMailInboxId,
		},
	});
	await db.contact.deleteMany({
		where: {
			OR: [{ id: { in: contactIds } }, { email: `sender@${agentMailDomain}` }],
		},
	});
	await db.company.deleteMany({
		where: {
			OR: [{ id: { in: companyIds } }, { domain: agentMailDomain }],
		},
	});
	await db.user.deleteMany({ where: { id: userId } });
});

function websiteLead(overrides: Partial<WebsiteLead> = {}): WebsiteLead {
	return {
		id: websiteExternalId,
		created_at: new Date().toISOString(),
		name: "Alex Green",
		email: `alex@${websiteDomain}`,
		company: "Website Test Landscapes",
		country: "Australia",
		biggest_pain: "Coordinating crews and customer updates",
		source: "request_access",
		source_path: "/#request-access",
		utm: { campaign: "integration-test" },
		qa_tag: null,
		notes: null,
		...overrides,
	};
}

describe("website enquiry intake", () => {
	it("recognises untagged deployment probes", () => {
		expect(
			isWebsiteTestLead(
				websiteLead({
					name: "Smoke Probe",
					email: "deploy@example.invalid",
					company: "QA",
					qa_tag: null,
				}),
			),
		).toBe(true);
	});

	it("creates rich CRM records once and queues safe enrichment", async () => {
		const first = await importWebsiteLeads([websiteLead()]);
		const second = await importWebsiteLeads([websiteLead()]);

		expect(first).toMatchObject({ imported: 1, duplicates: 0, tests: 0 });
		expect(second).toMatchObject({ imported: 0, duplicates: 1, tests: 0 });

		const enquiry = await db.websiteEnquiry.findUnique({
			where: { externalId: websiteExternalId },
			include: { companyRecord: true, contact: true },
		});
		expect(enquiry?.companyRecord?.domain).toBe(websiteDomain);
		expect(enquiry?.contact?.email).toBe(`alex@${websiteDomain}`);
		expect(enquiry?.biggestPain).toContain("Coordinating crews");

		const tasks = await db.agentTask.findMany({
			where: {
				OR: [
					{ companyId: enquiry?.companyId ?? "missing" },
					{ contactId: enquiry?.contactId ?? "missing" },
				],
			},
			select: { kind: true },
		});
		expect(new Set(tasks.map((task) => task.kind))).toEqual(
			new Set(["brand", "company-profile", "identify"]),
		);
	});

	it("isolates tagged website tests from live CRM records", async () => {
		const email = `qa@qa-${suffix}.example.test`;
		const result = await importWebsiteLeads([
			websiteLead({
				id: websiteQaExternalId,
				email,
				company: "QA Test Only",
				qa_tag: `qa-${suffix}`,
			}),
		]);

		expect(result).toMatchObject({ imported: 1, tests: 1 });
		expect(
			await db.websiteEnquiry.findUnique({
				where: { externalId: websiteQaExternalId },
				select: { test: true, companyId: true, contactId: true },
			}),
		).toEqual({ test: true, companyId: null, contactId: null });
		expect(await db.contact.count({ where: { email } })).toBe(0);
	});
});

describe("AgentMail inbound storage", () => {
	it("records the actual check time when an empty inbox sync succeeds", async () => {
		const previousKey = process.env.AGENTMAIL_API_KEY;
		const previousInboxId = process.env.AGENTMAIL_INBOX_ID;
		const previousInboxEmail = process.env.AGENTMAIL_INBOX_EMAIL;
		const oldCheck = new Date("2026-01-01T00:00:00.000Z");
		const startedAt = new Date();

		process.env.AGENTMAIL_API_KEY = "test-key";
		process.env.AGENTMAIL_INBOX_ID = agentMailSyncInboxId;
		process.env.AGENTMAIL_INBOX_EMAIL = `sync@${agentMailDomain}`;

		try {
			await db.emailInbox.create({
				data: {
					provider: EmailProvider.AGENTMAIL,
					externalInboxId: agentMailSyncInboxId,
					email: `sync@${agentMailDomain}`,
					isEnabled: true,
					lastSyncedAt: oldCheck,
				},
			});

			const result = await runAgentMailSync(db, async () =>
				Response.json({ count: 0, messages: [], next_page_token: null }),
			);
			const inbox = await db.emailInbox.findUniqueOrThrow({
				where: {
					provider_externalInboxId: {
						provider: EmailProvider.AGENTMAIL,
						externalInboxId: agentMailSyncInboxId,
					},
				},
				select: { lastSyncedAt: true },
			});

			expect(result.status).toBe("synced");
			expect(inbox.lastSyncedAt?.getTime()).toBeGreaterThanOrEqual(
				startedAt.getTime(),
			);
		} finally {
			if (previousKey) process.env.AGENTMAIL_API_KEY = previousKey;
			else delete process.env.AGENTMAIL_API_KEY;
			if (previousInboxId) process.env.AGENTMAIL_INBOX_ID = previousInboxId;
			else delete process.env.AGENTMAIL_INBOX_ID;
			if (previousInboxEmail)
				process.env.AGENTMAIL_INBOX_EMAIL = previousInboxEmail;
			else delete process.env.AGENTMAIL_INBOX_EMAIL;
		}
	});

	it("stores an inbound message once against an exact CRM match", async () => {
		const company = await db.company.create({
			data: { name: "AgentMail Test Landscapes", domain: agentMailDomain },
			select: { id: true },
		});
		const contact = await db.contact.create({
			data: {
				firstName: "Morgan",
				email: `sender@${agentMailDomain}`,
				companyId: company.id,
			},
			select: { id: true },
		});
		const inbox = await db.emailInbox.create({
			data: {
				provider: EmailProvider.AGENTMAIL,
				externalInboxId: agentMailInboxId,
				email: `lode@${agentMailDomain}`,
				isEnabled: true,
			},
			select: { id: true },
		});
		const message: AgentMailMessage = {
			inbox_id: agentMailInboxId,
			thread_id: agentMailThreadId,
			message_id: agentMailMessageId,
			labels: ["received"],
			timestamp: new Date().toISOString(),
			from: `Morgan Field <sender@${agentMailDomain}>`,
			to: [`Lode <lode@${agentMailDomain}>`],
			cc: [],
			bcc: [],
			subject: "Request access follow-up",
			preview: "Can we test this with our crews?",
			text: "Can we test this with our crews next week?",
			extracted_text: "Can we test this with our crews next week?",
		};

		expect(
			await importAgentMailMessage(
				message,
				{ companyId: company.id, contactId: contact.id },
				inbox.id,
			),
		).toBe(true);
		expect(
			await importAgentMailMessage(
				message,
				{ companyId: company.id, contactId: contact.id },
				inbox.id,
			),
		).toBe(false);

		const thread = await db.emailThread.findUnique({
			where: {
				provider_externalThreadId: {
					provider: EmailProvider.AGENTMAIL,
					externalThreadId: agentMailThreadId,
				},
			},
			include: { messages: true, activity: true },
		});
		expect(thread?.companyId).toBe(company.id);
		expect(thread?.contactId).toBe(contact.id);
		expect(thread?.messages).toHaveLength(1);
		expect(thread?.messages[0]?.body).toContain("next week");
		expect(thread?.activity?.type).toBe("EMAIL");
		expect(
			await db.emailProviderEvent.count({
				where: {
					provider: EmailProvider.AGENTMAIL,
					externalEventId: `poll:${agentMailMessageId}`,
				},
			}),
		).toBe(1);
	});

	it("runs both provider checks outside the research model lane", () => {
		expect(DIRECT_KINDS).toContain("website-intake-sync");
		expect(DIRECT_KINDS).toContain("agentmail-sync");
		expect(DIRECT_KINDS).toContain("granola-sync");
	});
});

describe("Granola meeting storage", () => {
	it("creates the customer, contact and rich meeting once", async () => {
		const createdAt = new Date().toISOString();
		const note: GranolaNoteInput = {
			id: granolaExternalId,
			title: "RPS Test x Lode",
			created_at: createdAt,
			updated_at: createdAt,
			web_url: `https://notes.granola.ai/d/${granolaExternalId}`,
			owner: { name: "Inbound Test", email: `${userId}@example.test` },
			calendar_event: {
				event_title: "RPS Test x Lode",
				invitees: [
					{ name: "Inbound Test", email: `${userId}@example.test` },
					{ name: "Charlie Lawson", email: `charlie@${granolaDomain}` },
				],
				organiser: `${userId}@example.test`,
				calendar_event_id: `event-${suffix}`,
				scheduled_start_time: createdAt,
				scheduled_end_time: new Date(Date.now() + 3_600_000).toISOString(),
			},
			attendees: [
				{ name: "Inbound Test", email: `${userId}@example.test` },
				{ name: "Charlie Lawson", email: `charlie@${granolaDomain}` },
			],
			folder_membership: [
				{
					id: `folder-${suffix}`,
					name: "RPS Test",
					parent_folder_id: null,
					space_id: `space-${suffix}`,
				},
			],
			summary_text:
				"Charlie confirmed that contract automation is the next priority.",
			summary_markdown:
				"## Outcome\n\nContract automation is the next priority.",
			transcript: [
				{
					text: "Contract automation is the next priority.",
					start_time: "0",
					end_time: "4",
					speaker: {
						source: "calendar",
						attribution: {
							name: "Charlie Lawson",
							email: `charlie@${granolaDomain}`,
						},
					},
				},
			],
		};

		const results = await Promise.all([
			importGranolaNote(note, new Set(["example.test"])),
			importGranolaNote(note, new Set(["example.test"])),
		]);
		expect(results.filter((result) => result.created)).toHaveLength(1);
		expect(results.every((result) => result.matched)).toBe(true);

		let stored = await db.granolaNote.findUnique({
			where: { externalId: granolaExternalId },
			include: { company: true, contact: true, activity: true },
		});
		expect(stored?.company?.name).toBe("RPS Test");
		expect(stored?.company?.domain).toBe(granolaDomain);
		expect(stored?.contact?.email).toBe(`charlie@${granolaDomain}`);
		expect(stored?.activity?.type).toBe("MEETING");
		expect(stored?.summary).toContain("Contract automation");
		expect(Array.isArray(stored?.transcript)).toBe(true);
		expect(stored?.company?.lastActivityAt?.toISOString()).toBe(createdAt);
		expect(stored?.contact?.lastActivityAt?.toISOString()).toBe(createdAt);
		expect(
			await db.activity.count({
				where: { granolaNotes: { some: { externalId: granolaExternalId } } },
			}),
		).toBe(1);

		const updatedAt = new Date(Date.now() + 60_000).toISOString();
		await importGranolaNote(
			{
				...note,
				title: "RPS Test x Lode — revised",
				updated_at: updatedAt,
				summary_markdown: "## Outcome\n\nThe priority has moved to scheduling.",
			},
			new Set(["example.test"]),
		);
		stored = await db.granolaNote.findUnique({
			where: { externalId: granolaExternalId },
			include: { activity: true },
		});
		expect(stored?.activity?.subject).toContain("revised");
		expect(stored?.activity?.body).toContain("scheduling");
		const restricted = await readCompanyHistory(
			stored?.companyId ?? "missing",
			{
				includeGranola: false,
			},
		);
		expect(restricted?.granolaCalls).toEqual([]);
	});

	it("continues pagination when a note is no longer accessible", async () => {
		const requests: string[] = [];
		const request = (async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			requests.push(url.toString());
			if (url.pathname.startsWith("/v1/notes/not_missing")) {
				return new Response(null, { status: 404 });
			}
			if (url.searchParams.get("cursor") === "next-page") {
				return Response.json({ notes: [], hasMore: false, cursor: null });
			}
			const timestamp = new Date().toISOString();
			return Response.json({
				notes: [
					{
						id: "not_missing_detail",
						title: null,
						created_at: timestamp,
						updated_at: timestamp,
					},
				],
				hasMore: true,
				cursor: "next-page",
			});
		}) as typeof fetch;

		const outcome = await runGranolaSync(db, request, 0);
		expect(outcome.status).toBe("synced");
		expect(outcome.unchanged).toBe(1);
		expect(requests).toHaveLength(3);
		expect(requests.at(-1)).toContain("cursor=next-page");
	});

	it("leaves a multi-company meeting unmatched without a trusted folder map", async () => {
		const timestamp = new Date().toISOString();
		const externalId = `not_${crypto.randomUUID().replaceAll("-", "").slice(0, 14)}`;
		const firstDomain = `first-${suffix}.example.test`;
		const secondDomain = `second-${suffix}.example.test`;

		try {
			const result = await importGranolaNote(
				{
					id: externalId,
					title: "Multi-company customer call",
					created_at: timestamp,
					updated_at: timestamp,
					calendar_event: null,
					attendees: [
						{ name: "First Person", email: `first@${firstDomain}` },
						{ name: "Second Person", email: `second@${secondDomain}` },
					],
					folder_membership: [
						{
							id: `multi-${suffix}`,
							name: "Shared folder",
							parent_folder_id: null,
							space_id: `space-${suffix}`,
						},
					],
					summary_text: "A joint call.",
					transcript: null,
				},
				new Set(["example.test"]),
			);

			expect(result.matched).toBe(false);
			expect(
				await db.company.count({
					where: { domain: { in: [firstDomain, secondDomain] } },
				}),
			).toBe(0);
			expect(
				await db.contact.count({
					where: {
						email: { in: [`first@${firstDomain}`, `second@${secondDomain}`] },
					},
				}),
			).toBe(0);
		} finally {
			const stored = await db.granolaNote.findUnique({
				where: { externalId },
				select: { activityId: true },
			});
			await db.granolaNote.deleteMany({ where: { externalId } });
			if (stored?.activityId) {
				await db.activity.deleteMany({ where: { id: stored.activityId } });
			}
			await db.contact.deleteMany({
				where: {
					email: { in: [`first@${firstDomain}`, `second@${secondDomain}`] },
				},
			});
			await db.company.deleteMany({
				where: { domain: { in: [firstDomain, secondDomain] } },
			});
		}
	});

	it("uses an explicit folder-domain map for internal-only customer notes", async () => {
		const timestamp = new Date().toISOString();
		const externalId = `not_${crypto.randomUUID().replaceAll("-", "").slice(0, 14)}`;
		const domain = `mapped-${suffix}.example.test`;
		const company = await db.company.create({
			data: { name: "Mapped customer", domain, ownerId: userId },
			select: { id: true },
		});

		try {
			const result = await importGranolaNote(
				{
					id: externalId,
					title: "Mapped customer planning",
					created_at: timestamp,
					updated_at: timestamp,
					calendar_event: null,
					attendees: [
						{ name: "Inbound Test", email: `${userId}@example.test` },
					],
					folder_membership: [
						{
							id: `mapped-${suffix}`,
							name: "Mapped customer",
							parent_folder_id: null,
							space_id: `space-${suffix}`,
						},
					],
					summary_text: "Internal preparation for a known customer.",
					transcript: null,
				},
				{
					internalAddresses: new Set([`${userId}@example.test`]),
					internalDomains: new Set(["example.test"]),
					suppressedAddresses: new Set(),
					suppressedDomains: new Set(),
					folderDomains: new Map([["mapped customer", domain]]),
				},
			);

			expect(result.matched).toBe(true);
			expect(result.companyId).toBe(company.id);
			expect(result.newContactIds).toEqual([]);
		} finally {
			const stored = await db.granolaNote.findUnique({
				where: { externalId },
				select: { activityId: true },
			});
			await db.granolaNote.deleteMany({ where: { externalId } });
			if (stored?.activityId) {
				await db.activity.deleteMany({ where: { id: stored.activityId } });
			}
			await db.company.deleteMany({ where: { id: company.id } });
		}
	});

	it("does not attach an internal-only note from its folder name", async () => {
		const timestamp = new Date().toISOString();
		const externalId = `not_${crypto.randomUUID().replaceAll("-", "").slice(0, 14)}`;
		const domain = `folder-only-${suffix}.example.test`;
		const company = await db.company.create({
			data: {
				name: "Folder-only test",
				domain,
				ownerId: userId,
			},
			select: { id: true },
		});

		try {
			const result = await importGranolaNote(
				{
					id: externalId,
					title: "Internal planning",
					created_at: timestamp,
					updated_at: timestamp,
					owner: { name: "Inbound Test", email: `${userId}@example.test` },
					calendar_event: null,
					attendees: [
						{ name: "Inbound Test", email: `${userId}@example.test` },
					],
					folder_membership: [
						{
							id: `folder-only-${suffix}`,
							name: "Folder-only test",
							parent_folder_id: null,
							space_id: `space-${suffix}`,
						},
					],
					summary_text: "Private internal planning.",
					transcript: null,
				},
				new Set(["example.test"]),
			);
			const stored = await db.granolaNote.findUniqueOrThrow({
				where: { externalId },
				select: { activityId: true, companyId: true, contactId: true },
			});
			expect(result.matched).toBe(false);
			expect(stored.companyId).toBeNull();
			expect(stored.contactId).toBeNull();
		} finally {
			const stored = await db.granolaNote.findUnique({
				where: { externalId },
				select: { activityId: true },
			});
			await db.granolaNote.deleteMany({ where: { externalId } });
			if (stored?.activityId) {
				await db.activity.deleteMany({ where: { id: stored.activityId } });
			}
			await db.company.deleteMany({ where: { id: company.id } });
		}
	});

	it("removes an excluded note and refuses to import it again", async () => {
		const timestamp = new Date().toISOString();
		const note: GranolaNoteInput = {
			id: excludedGranolaExternalId,
			title: "Private note",
			created_at: timestamp,
			updated_at: timestamp,
			owner: { name: "Inbound Test", email: `${userId}@example.test` },
			calendar_event: null,
			attendees: [{ name: "Inbound Test", email: `${userId}@example.test` }],
			folder_membership: [],
			summary_text: "This does not belong in the CRM.",
			transcript: null,
		};

		await importGranolaNote(note, new Set(["example.test"]));
		const stored = await db.granolaNote.findUniqueOrThrow({
			where: { externalId: excludedGranolaExternalId },
			select: { activityId: true },
		});
		const result = await excludeGranolaNotes(
			[excludedGranolaExternalId],
			"Private note",
		);
		expect(result.deletedNotes).toBe(1);
		expect(result.deletedActivities).toBe(1);
		expect(
			await db.granolaNote.findUnique({
				where: { externalId: excludedGranolaExternalId },
			}),
		).toBeNull();
		expect(
			await db.activity.findUnique({
				where: { id: stored.activityId ?? "missing" },
			}),
		).toBeNull();

		const replay = await importGranolaNote(note, new Set(["example.test"]));
		expect(replay.created).toBe(false);
		expect(
			await db.granolaNote.findUnique({
				where: { externalId: excludedGranolaExternalId },
			}),
		).toBeNull();
	});
});
