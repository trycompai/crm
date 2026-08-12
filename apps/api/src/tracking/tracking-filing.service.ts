import { workspaceDomains } from "@crm/auth";
import { ActivityType, type Db, Prisma, RecordSource } from "@crm/db";
import type { Touch } from "@crm/db/attribution";
import {
	CONTACT_CAP_REASON,
	CONTACTS_PER_HOUR,
	contactWindowKey,
} from "@crm/db/tracking";
import { Injectable, Logger } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { CompanyDirectoryService } from "../companies/company-directory.service";
import { isMachineDomain } from "../companies/domain";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { normalizeEmail } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import {
	isAutomatedAddress,
	isMachineAddress,
	splitName,
} from "../mailbox/participants";
import { TrackingCounterService } from "./tracking-counter.service";

function columns(
	touch: Touch | undefined,
	prefix: "first" | "last",
): Record<string, string | Date | null> {
	if (!touch) return {};

	return {
		[`${prefix}Source`]: touch.source,
		[`${prefix}Medium`]: touch.medium,
		[`${prefix}Campaign`]: touch.campaign,
		[`${prefix}Term`]: touch.term,
		[`${prefix}Content`]: touch.content,
		[`${prefix}Referrer`]: touch.referrer,
		[`${prefix}Landing`]: touch.landing,
		[`${prefix}TouchAt`]: touch.at,
	};
}

export type FilingOutcome =
	| { filed: true; contactId: string }
	| { filed: false; reason: string };

@Injectable()
export class TrackingFilingService {
	private readonly logger = new Logger(TrackingFilingService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly counters: TrackingCounterService,
		private readonly companies: CompanyDirectoryService,
		private readonly agent: AgentTriggerService,
		private readonly stamp: ActivityStampService,
	) {}

	async file(submission: {
		id: string;
		email: string | null;
		host: string;
		visitorId: string | null;
		name: string | null;
		firstTouch?: Touch;
		lastTouch?: Touch;
	}): Promise<FilingOutcome> {
		const email = normalizeEmail(submission.email ?? "");
		if (!email) return this.skip(submission.id, "No email address");

		if (isMachineAddress(email) || isAutomatedAddress(email)) {
			return this.skip(submission.id, "Not an address a human reads");
		}

		const domain = email.split("@")[1] ?? null;
		if (!domain) return this.skip(submission.id, "No usable domain");

		if (isMachineDomain(domain)) {
			return this.skip(submission.id, "Not a domain a human reads");
		}

		if (workspaceDomains().includes(domain)) {
			return this.skip(submission.id, "One of our own addresses");
		}

		const suppressed = await this.suppressed(email, domain);
		if (suppressed) return this.skip(submission.id, suppressed);

		const existing = await this.db.contact.findUnique({
			where: { email },
			select: { id: true },
		});

		if (existing) {
			await this.attach(submission.id, existing.id, submission);
			return { filed: true, contactId: existing.id };
		}

		const window = contactWindowKey();

		if (!(await this.counters.take(window, CONTACTS_PER_HOUR))) {
			return this.skip(submission.id, CONTACT_CAP_REASON);
		}

		const companyId = await this.companies.companyForEmail(email);
		const { firstName, lastName } = splitName(submission.name, email);

		let contact: { id: string };
		try {
			contact = await this.db.contact.create({
				data: {
					firstName,
					lastName,
					email,
					companyId,
					source: RecordSource.TRACKING,
					lastActivityAt: new Date(),
				},
				select: { id: true },
			});
		} catch (error) {
			await this.counters.release(window);

			const raced = await this.raced(error, email);
			if (!raced) throw error;

			await this.attach(submission.id, raced.id, submission);

			return { filed: true, contactId: raced.id };
		}

		await this.attach(submission.id, contact.id, submission);

		await this.agent.contactCreated(
			contact.id,
			`Submitted a form on ${submission.host}`,
		);

		this.logger.log({
			message: "Contact filed from a form submission",
			contactId: contact.id,
			host: submission.host,
		});

		return { filed: true, contactId: contact.id };
	}

	private async raced(
		error: unknown,
		email: string,
	): Promise<{ id: string } | null> {
		if (
			!(error instanceof Prisma.PrismaClientKnownRequestError) ||
			error.code !== "P2002"
		) {
			return null;
		}

		return this.db.contact.findUnique({
			where: { email },
			select: { id: true },
		});
	}

	private async attach(
		submissionId: string,
		contactId: string,
		context: {
			visitorId: string | null;
			firstTouch?: Touch;
			lastTouch?: Touch;
		},
	): Promise<void> {
		const { visitorId } = context;
		const claimed = await this.db.formSubmission.updateMany({
			where: { id: submissionId, filedAt: null },
			data: { contactId, filedAt: new Date(), skipReason: null },
		});

		if (claimed.count === 0) return;

		const submission = await this.db.formSubmission.findUniqueOrThrow({
			where: { id: submissionId },
			select: { host: true, path: true },
		});

		const author = await this.author(contactId);

		if (author) {
			const activity = await this.db.activity.create({
				data: {
					type: ActivityType.NOTE,
					subject: `Submitted a form on ${submission.host}`,
					body: `${submission.host}${submission.path}`,
					contactId,
					occurredAt: new Date(),
					createdById: author,
					meta: { automated: true, source: "tracking" },
				},
				select: { createdAt: true },
			});

			await this.stamp.touch({ contactId }, activity.createdAt);
		}

		if (!visitorId) return;

		const first = columns(context.firstTouch, "first");
		const last = columns(context.lastTouch, "last");

		await this.db.trackedVisitor.upsert({
			where: { id: visitorId },
			create: { id: visitorId, contactId, ...first, ...last },
			update: { contactId, ...last },
		});
	}

	private async author(contactId: string): Promise<string | null> {
		const contact = await this.db.contact.findUnique({
			where: { id: contactId },
			select: { ownerId: true },
		});

		if (contact?.ownerId) return contact.ownerId;

		const anyUser = await this.db.user.findFirst({ select: { id: true } });

		return anyUser?.id ?? null;
	}

	private async skip(
		submissionId: string,
		reason: string,
	): Promise<FilingOutcome> {
		await this.db.formSubmission.update({
			where: { id: submissionId },
			data: { skipReason: reason },
		});

		return { filed: false, reason };
	}

	private async suppressed(
		email: string,
		domain: string,
	): Promise<string | null> {
		const [contact, host] = await Promise.all([
			this.db.suppressedContact.findFirst({
				where: { email: { equals: email, mode: "insensitive" } },
				select: { email: true },
			}),
			this.db.suppressedDomain.findUnique({
				where: { domain },
				select: { domain: true },
			}),
		]);

		if (contact) return "This address was deleted by a rep";
		if (host) return "This domain is suppressed";

		return null;
	}
}
