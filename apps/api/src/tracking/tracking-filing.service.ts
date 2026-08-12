import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { normalizeEmail } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";

export type FilingOutcome = { filed: false; reason: string };

@Injectable()
export class TrackingFilingService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async file(submission: {
		id: string;
		email: string | null;
		host: string;
		visitorId: string | null;
		name: string | null;
		firstTouch?: unknown;
		lastTouch?: unknown;
	}): Promise<FilingOutcome> {
		if (!normalizeEmail(submission.email ?? "")) {
			await this.db.formSubmission.updateMany({
				where: { id: submission.id, reviewQueuedAt: null },
				data: { skipReason: "No email address" },
			});

			return { filed: false, reason: "No email address" };
		}

		const queuedAt = new Date();
		const claimed = await this.db.formSubmission.updateMany({
			where: { id: submission.id, reviewQueuedAt: null },
			data: { reviewQueuedAt: queuedAt, skipReason: null },
		});
		if (claimed.count === 0) {
			return { filed: false, reason: "Already queued for identity review" };
		}

		try {
			await this.agent.trackingSubmissionReceived(
				submission.id,
				submission.host,
			);
		} catch (error) {
			await this.db.formSubmission.updateMany({
				where: { id: submission.id, reviewQueuedAt: queuedAt },
				data: { reviewQueuedAt: null },
			});
			throw error;
		}

		return { filed: false, reason: "Queued for identity review" };
	}
}
