import { createHash } from "node:crypto";
import {
	canonicalWorkspaceEmail,
	isWorkspaceEmail,
	workspaceDomains,
	workspaceEmailAliases,
} from "@crm/auth/workspace";
import {
	ContactCandidatePermissionState,
	ContactCandidateStatus,
	type Db,
	db,
	EmailProvider,
	type Prisma,
} from "@crm/db";
import {
	previewInboundCanonicalIdentityKey,
	retainedContactCandidateHash,
	retainedContactCandidateObservationHash,
	sanitizeInboundRedactedMetadata,
} from "@crm/db/inbound/provenance";
import { WORKSPACE_ID } from "@crm/db/workspace";

export const INBOUND_CANDIDATE_REPLAY_TASK_KIND = "inbound-candidate-replay";
export const INBOUND_REPLAY_INTERVAL_MS = 5 * 60_000;
export const INBOUND_REPLAY_PAGE_SIZE = 100;
export const INBOUND_REPLAY_MAX_RECORDS = 500;

export type InboundReplayOutcome = {
	scanned: number;
	receipts: number;
	candidates: number;
	observations: number;
	duplicates: number;
	duplicateReceipts: number;
	duplicateCandidates: number;
	duplicateObservations: number;
	excluded: number;
	hasMore: boolean;
	nextFormCursor: string | null;
	nextWebsiteCursor: string | null;
	nextEmailCursor: string | null;
	formsDone: boolean;
	websiteDone: boolean;
	emailDone: boolean;
};

export type InboundReplayCursor = {
	formSubmissionId?: string | null;
	websiteExternalId?: string | null;
	emailMessageId?: string | null;
	formsDone?: boolean;
	websiteDone?: boolean;
	emailDone?: boolean;
};

export function inboundReplayPageWindow(remaining: number): {
	request: number;
	process: number;
} {
	return {
		request: Math.min(INBOUND_REPLAY_PAGE_SIZE + 1, remaining + 1),
		process: Math.min(INBOUND_REPLAY_PAGE_SIZE, remaining),
	};
}

export function inboundReplayOutcomeText(result: InboundReplayOutcome): string {
	return `Scanned ${result.scanned}; receipts ${result.receipts}; candidates ${result.candidates}; observations ${result.observations}; duplicates ${result.duplicates}; excluded ${result.excluded}; hasMore ${result.hasMore}; formsDone ${result.formsDone}; websiteDone ${result.websiteDone}; emailDone ${result.emailDone}; nextFormCursor ${result.nextFormCursor ?? "none"}; nextWebsiteCursor ${result.nextWebsiteCursor ?? "none"}; nextEmailCursor ${result.nextEmailCursor ?? "none"}.`;
}

type Participant = {
	email: string;
	name: string | null;
};

type ParticipantRules = {
	internalAddresses: ReadonlySet<string>;
	internalDomains: ReadonlySet<string>;
	suppressedAddresses: ReadonlySet<string>;
	suppressedDomains: ReadonlySet<string>;
};

type CandidateInput = {
	email: string;
	name: string | null;
	businessName: string | null;
	evidenceClass: string;
	source: {
		connector: string;
		provider: string;
		accountId: string;
		objectType: string;
		objectId: string;
		createdAt: Date | null;
		updatedAt: Date | null;
		metadata: Record<string, string | number | boolean | null>;
		versionDigest: string;
		url?: string | null;
	};
};

type SourceReceiptResult = {
	id: string;
	created: boolean;
};

type CandidateResult = {
	id: string;
	created: boolean;
};

const REPLAY_EMAIL_PROVIDERS = [
	EmailProvider.GMAIL,
	EmailProvider.OUTLOOK,
	EmailProvider.AGENTMAIL,
] as const;

export function canonicalInboundJson(value: unknown): string {
	const encoded = stableJson(value);
	if (encoded === undefined) throw new Error("Value is not JSON serializable");
	return encoded;
}

function stableJson(value: unknown): string | undefined {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		const values = value.map(stableJson);
		if (values.some((item) => item === undefined)) return undefined;
		return `[${values.join(",")}]`;
	}
	const entries = Object.entries(value as Record<string, unknown>).sort(
		([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
	);
	const encoded = entries.map(([key, item]) => {
		const child = stableJson(item);
		return child === undefined ? undefined : `${JSON.stringify(key)}:${child}`;
	});
	if (encoded.some((item) => item === undefined)) return undefined;
	return `{${encoded.join(",")}}`;
}

function digest(value: unknown): string {
	return createHash("sha256")
		.update(canonicalInboundJson(value), "utf8")
		.digest("hex");
}

function clean(value: string | null | undefined): string | null {
	const next = value?.normalize("NFKC").trim();
	return next ? next : null;
}

function emailAddress(value: string | null | undefined): string | null {
	const next = clean(value)?.toLowerCase() ?? null;
	if (!next || !/^[^\s@]+@[^\s@]+$/.test(next)) return null;
	return next;
}

function emailDomain(email: string): string | null {
	const at = email.lastIndexOf("@");
	return at > 0 ? email.slice(at + 1).toLowerCase() : null;
}

function sourceMetadata(
	input: CandidateInput["source"],
): Record<string, string | number | boolean | null> {
	return sanitizeInboundRedactedMetadata({
		connector: input.connector,
		provider: input.provider,
		accountId: input.accountId,
		sourceObjectType: input.objectType,
		sourceObjectId: input.objectId,
		sourceVersion: input.versionDigest,
		sourceCreatedAt: input.createdAt?.toISOString() ?? null,
		...input.metadata,
	}) as Record<string, string | number | boolean | null>;
}

export function websiteSourceDigest(row: {
	externalId: string;
	createdAtSource: Date;
	name: string | null;
	email: string;
	company: string | null;
	country: string | null;
	biggestPain: string | null;
	notes: string | null;
	utm: unknown;
	source: string;
	sourcePath: string | null;
}): string {
	return digest({
		createdAtSource: row.createdAtSource.toISOString(),
		email: clean(row.email),
		externalId: row.externalId,
		name: clean(row.name),
		company: clean(row.company),
		country: clean(row.country),
		biggestPain: clean(row.biggestPain),
		notes: clean(row.notes),
		source: clean(row.source),
		sourcePath: clean(row.sourcePath),
		utm: row.utm,
	});
}

export function emailSourceDigest(row: {
	provider: string;
	accountId: string;
	objectId: string;
	threadId: string;
	rfcMessageId: string;
	direction: string;
	sentAt: Date;
	fromEmail: string;
	fromName: string | null;
	recipients: unknown;
}): string {
	return digest({
		accountId: row.accountId,
		direction: row.direction,
		fromEmail: emailAddress(row.fromEmail),
		fromName: clean(row.fromName),
		objectId: row.objectId,
		provider: row.provider,
		recipients: emailParticipants(row.recipients).sort((a, b) =>
			a.email.localeCompare(b.email),
		),
		rfcMessageId: row.rfcMessageId,
		sentAt: row.sentAt.toISOString(),
		threadId: row.threadId,
	});
}

export function trackingSubmissionSourceDigest(row: {
	id: string;
	visitorId: string | null;
	host: string;
	path: string;
	email: string | null;
	fields: unknown;
	firstTouch: unknown;
	lastTouch: unknown;
	consentEvidence: unknown;
	dedupeKey: string;
	createdAt: Date;
}): string {
	return digest({
		id: row.id,
		visitorId: row.visitorId,
		host: row.host,
		path: row.path,
		email: emailAddress(row.email),
		fields: row.fields,
		firstTouch: row.firstTouch,
		lastTouch: row.lastTouch,
		consentEvidence: row.consentEvidence,
		dedupeKey: row.dedupeKey,
		createdAt: row.createdAt.toISOString(),
	});
}

export function emailParticipants(value: unknown): Participant[] {
	const source = Array.isArray(value)
		? value
		: value && typeof value === "object"
			? Object.values(value as Record<string, unknown>).flatMap((item) =>
					Array.isArray(item) ? item : [],
				)
			: [];
	const seen = new Set<string>();
	const participants: Participant[] = [];
	for (const item of source) {
		const candidate =
			typeof item === "string"
				? { email: item, name: null }
				: item && typeof item === "object"
					? (item as { email?: unknown; name?: unknown })
					: null;
		const email = emailAddress(
			typeof candidate?.email === "string" ? candidate.email : null,
		);
		if (!email || seen.has(email)) continue;
		seen.add(email);
		participants.push({
			email,
			name: typeof candidate?.name === "string" ? clean(candidate.name) : null,
		});
	}
	return participants;
}

function replaySourceKey(input: CandidateInput["source"]): string {
	return [
		input.connector,
		input.provider,
		input.accountId,
		input.objectType,
		input.objectId,
		input.versionDigest,
	].join("|");
}

async function lock(
	database: Prisma.TransactionClient,
	key: string,
): Promise<void> {
	await database.$executeRaw`
		SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
	`;
}

async function ensureReceipt(
	database: Db,
	input: CandidateInput["source"],
): Promise<SourceReceiptResult> {
	return database.$transaction(async (transaction) => {
		await lock(transaction, `inbound-replay:${replaySourceKey(input)}`);
		const existing = await transaction.inboundSourceReceipt.findFirst({
			where: {
				connector: input.connector,
				provider: input.provider,
				accountId: input.accountId,
				sourceObjectType: input.objectType,
				sourceObjectId: input.objectId,
				sourceDigest: input.versionDigest,
			},
			select: { id: true },
		});
		if (existing) return { id: existing.id, created: false };

		const receipt = await transaction.inboundSourceReceipt.create({
			data: {
				connector: input.connector,
				provider: input.provider,
				accountId: input.accountId,
				sourceObjectType: input.objectType,
				sourceObjectId: input.objectId,
				sourceDigest: input.versionDigest,
				sourceCreatedAt: input.createdAt,
				sourceUpdatedAt: input.updatedAt,
				sourceUrl: input.url ?? null,
				redactedMetadata: sourceMetadata(input),
			},
			select: { id: true },
		});
		return { id: receipt.id, created: true };
	});
}

async function participantRules(database: Db): Promise<ParticipantRules> {
	const [members, suppressedDomains, suppressedContacts] = await Promise.all([
		database.member.findMany({
			where: { organizationId: WORKSPACE_ID },
			select: { user: { select: { email: true } } },
		}),
		database.suppressedDomain.findMany({ select: { domain: true } }),
		database.suppressedContact.findMany({ select: { email: true } }),
	]);
	const internalAddresses = new Set<string>();
	const internalDomains = new Set<string>(
		workspaceDomains().map((domain) => domain.trim().toLowerCase()),
	);
	for (const alias of workspaceEmailAliases()) {
		internalAddresses.add(alias.trim().toLowerCase());
		const canonical = canonicalWorkspaceEmail(alias);
		if (canonical) internalAddresses.add(canonical);
	}
	for (const member of members) {
		const user = member.user;
		const raw = user.email.trim().toLowerCase();
		internalAddresses.add(raw);
		const canonical = canonicalWorkspaceEmail(user.email);
		if (canonical) {
			internalAddresses.add(canonical);
			const domain = emailDomain(canonical);
			if (domain) internalDomains.add(domain);
		}
		const domain = emailDomain(raw);
		if (domain) internalDomains.add(domain);
	}
	return {
		internalAddresses,
		internalDomains,
		suppressedAddresses: new Set(
			suppressedContacts.map((row) => row.email.trim().toLowerCase()),
		),
		suppressedDomains: new Set(
			suppressedDomains.map((row) => row.domain.trim().toLowerCase()),
		),
	};
}

function excludedParticipant(
	participant: Participant,
	rules: ParticipantRules,
): { internal: boolean; suppressed: boolean } {
	const email = participant.email;
	const domain = emailDomain(email);
	const internal =
		internalAddress(rules, email) ||
		isWorkspaceEmail(email) ||
		Boolean(domain && rules.internalDomains.has(domain));
	const suppressed =
		rules.suppressedAddresses.has(email) ||
		Boolean(domain && rules.suppressedDomains.has(domain));
	return { internal, suppressed };
}

function internalAddress(rules: ParticipantRules, email: string): boolean {
	return rules.internalAddresses.has(email);
}

function duplicate(
	outcome: InboundReplayOutcome,
	kind: "receipt" | "candidate" | "observation",
): void {
	outcome.duplicates += 1;
	if (kind === "receipt") outcome.duplicateReceipts += 1;
	if (kind === "candidate") outcome.duplicateCandidates += 1;
	if (kind === "observation") outcome.duplicateObservations += 1;
}

async function exactContact(database: Db, email: string) {
	return database.contact.findFirst({
		where: { email: { equals: email, mode: "insensitive" } },
		select: { id: true, companyId: true },
	});
}

async function ensureCandidate(
	database: Db,
	input: CandidateInput,
	rules: ParticipantRules,
): Promise<CandidateResult> {
	const domain = emailDomain(input.email);
	const retainedHash = retainedContactCandidateHash({
		canonicalEmail: input.email,
		canonicalName: input.name,
		canonicalBusinessName: input.businessName,
		canonicalDomain: domain,
	});
	const canonicalIdentityKey = previewInboundCanonicalIdentityKey({
		canonicalEmail: input.email,
		canonicalName: input.name,
		canonicalBusinessName: input.businessName,
		canonicalDomain: domain,
	});
	const suppressed = excludedParticipant(
		{ email: input.email, name: input.name },
		rules,
	).suppressed;
	const contact = suppressed ? null : await exactContact(database, input.email);
	const status = suppressed
		? ContactCandidateStatus.QUARANTINED
		: contact
			? ContactCandidateStatus.MATCH_PROPOSED
			: ContactCandidateStatus.PENDING;
	const permissionState = suppressed
		? ContactCandidatePermissionState.PROHIBITED
		: ContactCandidatePermissionState.REVIEW_REQUIRED;

	return database.$transaction(async (transaction) => {
		await lock(transaction, `inbound-candidate-email:${input.email}`);
		const existing = await transaction.contactCandidate.findUnique({
			where: { canonicalIdentityKey },
			select: {
				id: true,
				status: true,
				permissionState: true,
			},
		});
		if (existing) {
			if (
				existing.status === ContactCandidateStatus.PENDING ||
				existing.status === ContactCandidateStatus.MATCH_PROPOSED
			) {
				await transaction.contactCandidate.update({
					where: { id: existing.id },
					data: {
						rawEmail: input.email,
						rawName: input.name,
						rawBusinessName: input.businessName,
						canonicalEmail: input.email,
						canonicalName: input.name,
						canonicalBusinessName: input.businessName,
						canonicalDomain: domain,
						status,
						permissionState,
						...(contact
							? {
									proposedContactId: contact.id,
									proposedCompanyId: contact.companyId,
								}
							: { proposedContactId: null, proposedCompanyId: null }),
					},
				});
			}
			return { id: existing.id, created: false };
		}

		const candidate = await transaction.contactCandidate.create({
			data: {
				identityKey: retainedHash,
				rawEmail: input.email,
				rawName: input.name,
				rawBusinessName: input.businessName,
				rawDomain: domain,
				canonicalEmail: input.email,
				canonicalName: input.name,
				canonicalBusinessName: input.businessName,
				canonicalDomain: domain,
				status,
				permissionState,
				proposedContactId: contact?.id ?? null,
				proposedCompanyId: contact?.companyId ?? null,
			},
			select: { id: true },
		});
		return { id: candidate.id, created: true };
	});
}

async function ensureObservation(
	database: Db,
	candidateId: string,
	receiptId: string,
	input: CandidateInput,
): Promise<boolean> {
	const retainedHash = retainedContactCandidateObservationHash({
		candidateIdentity: {
			canonicalEmail: input.email,
			canonicalName: input.name,
			canonicalBusinessName: input.businessName,
			canonicalDomain: emailDomain(input.email),
		},
		source: {
			connector: input.source.connector,
			provider: input.source.provider,
			accountId: input.source.accountId,
			sourceObjectType: input.source.objectType,
			sourceObjectId: input.source.objectId,
			sourceDigest: input.source.versionDigest,
		},
		observedEmail: input.email,
		observedName: input.name,
		observedCompany: input.businessName,
		observedDomain: emailDomain(input.email),
		evidenceClass: input.evidenceClass,
	});
	return database.$transaction(async (transaction) => {
		await lock(transaction, `inbound-candidate-email:${input.email}`);
		const existing = await transaction.contactCandidateObservation.findFirst({
			where: {
				candidateId,
				receiptId,
				sourceDigest: input.source.versionDigest,
				evidenceClass: input.evidenceClass,
				observedEmail: input.email,
				observedName: input.name,
				observedCompany: input.businessName,
				observedDomain: emailDomain(input.email),
				observedTitle: null,
				observedRole: null,
			},
			select: { id: true },
		});
		if (existing) return false;
		await transaction.contactCandidateObservation.create({
			data: {
				candidateId,
				receiptId,
				sourceDigest: input.source.versionDigest,
				observationKey: retainedHash,
				observedEmail: input.email,
				observedName: input.name,
				observedCompany: input.businessName,
				observedDomain: emailDomain(input.email),
				observedTitle: null,
				observedRole: null,
				evidenceClass: input.evidenceClass,
			},
		});
		return true;
	});
}

async function processCandidate(
	database: Db,
	input: CandidateInput,
	rules: ParticipantRules,
	outcome: InboundReplayOutcome,
	receipt?: SourceReceiptResult,
): Promise<{ receiptId: string; candidateId: string }> {
	const sourceReceipt =
		receipt ?? (await ensureReceipt(database, input.source));
	if (!receipt) {
		if (sourceReceipt.created) outcome.receipts += 1;
		else duplicate(outcome, "receipt");
	}
	const candidate = await ensureCandidate(database, input, rules);
	if (candidate.created) outcome.candidates += 1;
	else duplicate(outcome, "candidate");
	if (
		excludedParticipant({ email: input.email, name: input.name }, rules)
			.suppressed
	) {
		outcome.excluded += 1;
	}
	if (
		await ensureObservation(database, candidate.id, sourceReceipt.id, input)
	) {
		outcome.observations += 1;
	} else {
		duplicate(outcome, "observation");
	}

	return { receiptId: sourceReceipt.id, candidateId: candidate.id };
}

export async function runInboundCandidateReplay(
	database: Db = db,
	cursor: InboundReplayCursor = {},
): Promise<InboundReplayOutcome> {
	const outcome: InboundReplayOutcome = {
		scanned: 0,
		receipts: 0,
		candidates: 0,
		observations: 0,
		duplicates: 0,
		duplicateReceipts: 0,
		duplicateCandidates: 0,
		duplicateObservations: 0,
		excluded: 0,
		hasMore: false,
		nextFormCursor: null,
		nextWebsiteCursor: null,
		nextEmailCursor: null,
		formsDone: cursor.formsDone === true,
		websiteDone: cursor.websiteDone === true,
		emailDone: cursor.emailDone === true,
	};
	const rules = await participantRules(database);
	let formCursor: string | undefined = cursor.formSubmissionId ?? undefined;
	let formHasMore = false;
	let formRead = 0;
	while (!outcome.formsDone && formRead < INBOUND_REPLAY_MAX_RECORDS) {
		const window = inboundReplayPageWindow(
			INBOUND_REPLAY_MAX_RECORDS - formRead,
		);
		const take = window.request;
		const pageLimit = window.process;
		const forms = await database.formSubmission.findMany({
			where: formCursor ? { id: { gt: formCursor } } : undefined,
			orderBy: { id: "asc" },
			take,
			select: {
				id: true,
				visitorId: true,
				host: true,
				path: true,
				email: true,
				fields: true,
				firstTouch: true,
				lastTouch: true,
				consentEvidence: true,
				dedupeKey: true,
				createdAt: true,
			},
		});
		const page = forms.slice(0, pageLimit);
		formHasMore = forms.length > page.length;
		if (page.length === 0) break;

		for (const row of page) {
			formRead += 1;
			formCursor = row.id;
			outcome.scanned += 1;
			const sourceDigest = trackingSubmissionSourceDigest(row);
			const source = {
				connector: "tracking",
				provider: "first-party-collector",
				accountId: row.host,
				objectType: "form-submission",
				objectId: row.id,
				createdAt: row.createdAt,
				updatedAt: null,
				versionDigest: sourceDigest,
				url: `https://${row.host}${row.path}`,
				metadata: {
					resourceType: "form-submission",
					resourceId: row.id,
					status: "pending",
					capturedAt: row.createdAt.toISOString(),
				},
			};
			const email = emailAddress(row.email);
			const name = formValue(
				row.fields,
				/^(full[\s_-]?name|name|first[\s_-]?name|given)/i,
			);

			if (!email) {
				const receipt = await ensureReceipt(database, source);
				if (receipt.created) outcome.receipts += 1;
				else duplicate(outcome, "receipt");
				await database.formSubmission.update({
					where: { id: row.id },
					data: { receiptId: receipt.id },
				});
				outcome.excluded += 1;
				continue;
			}

			const excluded = excludedParticipant({ email, name }, rules);
			if (excluded.internal) {
				const receipt = await ensureReceipt(database, source);
				if (receipt.created) outcome.receipts += 1;
				else duplicate(outcome, "receipt");
				await database.formSubmission.update({
					where: { id: row.id },
					data: {
						receiptId: receipt.id,
						skipReason: "Internal identity excluded from candidate review",
					},
				});
				outcome.excluded += 1;
				continue;
			}

			const linked = await processCandidate(
				database,
				{
					email,
					name,
					businessName: formValue(
						row.fields,
						/^(company|organisation|organization|business)/i,
					),
					evidenceClass: "tracking-form-unverified-permission",
					source,
				},
				rules,
				outcome,
			);
			await database.formSubmission.update({
				where: { id: row.id },
				data: {
					candidateId: linked.candidateId,
					receiptId: linked.receiptId,
					skipReason: null,
				},
			});
		}

		if (forms.length < take || formRead >= INBOUND_REPLAY_MAX_RECORDS) break;
	}
	if (!formHasMore) outcome.formsDone = true;

	let websiteCursor: string | undefined = cursor.websiteExternalId ?? undefined;
	let websiteHasMore = false;
	let websiteRead = 0;
	while (!outcome.websiteDone && websiteRead < INBOUND_REPLAY_MAX_RECORDS) {
		const window = inboundReplayPageWindow(
			INBOUND_REPLAY_MAX_RECORDS - websiteRead,
		);
		const take = window.request;
		const pageLimit = window.process;
		const websites = await database.websiteEnquiry.findMany({
			where: {
				test: false,
				...(websiteCursor ? { externalId: { gt: websiteCursor } } : {}),
			},
			orderBy: { externalId: "asc" },
			take,
			select: {
				externalId: true,
				createdAtSource: true,
				name: true,
				email: true,
				company: true,
				country: true,
				biggestPain: true,
				notes: true,
				utm: true,
				source: true,
				sourcePath: true,
				candidateId: true,
				receiptId: true,
			},
		});
		const page = websites.slice(0, pageLimit);
		websiteHasMore = websites.length > page.length;
		if (page.length === 0) break;
		for (const row of page) {
			websiteRead += 1;
			websiteCursor = row.externalId;
			outcome.scanned += 1;
			const email = emailAddress(row.email);
			const sourceDigest = websiteSourceDigest(row);
			const source = {
				connector: "website",
				provider: "website",
				accountId: "website",
				objectType: "website-enquiry",
				objectId: row.externalId,
				createdAt: row.createdAtSource,
				updatedAt: null,
				versionDigest: sourceDigest,
				metadata: {},
			};
			if (!email) {
				const receipt = await ensureReceipt(database, source);
				if (receipt.created) outcome.receipts += 1;
				else duplicate(outcome, "receipt");
				await database.websiteEnquiry.update({
					where: { externalId: row.externalId },
					data: { receiptId: receipt.id, candidateId: null },
				});
				outcome.excluded += 1;
				continue;
			}
			const excluded = excludedParticipant(
				{ email, name: clean(row.name) },
				rules,
			);
			if (excluded.internal) {
				const receipt = await ensureReceipt(database, source);
				if (receipt.created) outcome.receipts += 1;
				else duplicate(outcome, "receipt");
				await database.websiteEnquiry.update({
					where: { externalId: row.externalId },
					data: { receiptId: receipt.id, candidateId: null },
				});
				outcome.excluded += 1;
				continue;
			}
			const linked = await processCandidate(
				database,
				{
					email,
					name: clean(row.name),
					businessName: clean(row.company),
					evidenceClass: "website-submission",
					source,
				},
				rules,
				outcome,
			);
			await database.websiteEnquiry.update({
				where: { externalId: row.externalId },
				data: {
					candidateId: linked.candidateId,
					receiptId: linked.receiptId,
				},
			});
		}
		if (websites.length < take || websiteRead >= INBOUND_REPLAY_MAX_RECORDS)
			break;
	}
	if (!websiteHasMore) outcome.websiteDone = true;

	let messageCursor: string | undefined = cursor.emailMessageId ?? undefined;
	let messageHasMore = false;
	let messageRead = 0;
	while (!outcome.emailDone && messageRead < INBOUND_REPLAY_MAX_RECORDS) {
		const window = inboundReplayPageWindow(
			INBOUND_REPLAY_MAX_RECORDS - messageRead,
		);
		const take = window.request;
		const pageLimit = window.process;
		const messages = await database.emailMessage.findMany({
			where: {
				provider: { in: [...REPLAY_EMAIL_PROVIDERS] },
				...(messageCursor ? { id: { gt: messageCursor } } : {}),
			},
			orderBy: { id: "asc" },
			take,
			select: {
				id: true,
				threadId: true,
				rfcMessageId: true,
				provider: true,
				syncedByUserId: true,
				externalInboxId: true,
				externalThreadId: true,
				externalMessageId: true,
				gmailMessageId: true,
				outlookMessageId: true,
				direction: true,
				fromEmail: true,
				fromName: true,
				recipients: true,
				sentAt: true,
			},
		});
		const page = messages.slice(0, pageLimit);
		messageHasMore = messages.length > page.length;
		if (page.length === 0) break;
		for (const row of page) {
			messageRead += 1;
			messageCursor = row.id;
			outcome.scanned += 1;
			const provider = row.provider.toLowerCase();
			const accountId =
				clean(row.externalInboxId) ?? clean(row.syncedByUserId) ?? "unknown";
			const objectId =
				clean(row.externalMessageId) ??
				clean(row.gmailMessageId) ??
				clean(row.outlookMessageId) ??
				row.rfcMessageId ??
				row.id;
			const threadId = clean(row.externalThreadId) ?? row.threadId;
			const sourceDigest = emailSourceDigest({
				provider,
				accountId,
				objectId,
				threadId,
				rfcMessageId: row.rfcMessageId,
				direction: row.direction,
				sentAt: row.sentAt,
				fromEmail: row.fromEmail,
				fromName: row.fromName,
				recipients: row.recipients,
			});
			const source = {
				connector: "mailbox",
				provider,
				accountId,
				objectType: "email-message",
				objectId,
				createdAt: row.sentAt,
				updatedAt: null,
				versionDigest: sourceDigest,
				metadata: { threadId, messageId: objectId },
			};
			const participants = emailParticipants([
				{ email: row.fromEmail, name: row.fromName },
				...emailParticipants(row.recipients),
			]);
			const receipt = await ensureReceipt(database, source);
			if (receipt.created) outcome.receipts += 1;
			else duplicate(outcome, "receipt");
			for (const participant of participants) {
				const excluded = excludedParticipant(participant, rules);
				if (excluded.internal) {
					outcome.excluded += 1;
					continue;
				}
				const email = participant.email;
				await processCandidate(
					database,
					{
						email,
						name: participant.name,
						businessName: null,
						evidenceClass: "email-envelope",
						source,
					},
					rules,
					outcome,
					receipt,
				);
			}
		}
		if (messages.length < take || messageRead >= INBOUND_REPLAY_MAX_RECORDS)
			break;
	}
	if (!messageHasMore) outcome.emailDone = true;
	outcome.hasMore = formHasMore || websiteHasMore || messageHasMore;
	outcome.nextFormCursor = formHasMore ? (formCursor ?? null) : null;
	outcome.nextWebsiteCursor = websiteHasMore ? (websiteCursor ?? null) : null;
	outcome.nextEmailCursor = messageHasMore ? (messageCursor ?? null) : null;
	return outcome;
}

function formValue(value: unknown, pattern: RegExp): string | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;

	for (const [key, candidate] of Object.entries(value)) {
		if (pattern.test(key) && typeof candidate === "string") {
			const normalized = clean(candidate);
			if (normalized) return normalized;
		}
	}

	return null;
}
