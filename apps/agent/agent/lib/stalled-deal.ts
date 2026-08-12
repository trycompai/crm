import { ActivityType, db } from "@crm/db";
import { isClosedStage } from "@crm/db/deal-stage";
import {
	daysInactive,
	STALLED_DEAL,
	stallTaskSubject,
} from "@crm/db/stalled-deals";
import type { LeasedTask } from "./tasks";

export async function flagStalledDeal(task: LeasedTask): Promise<string> {
	if (!task.dealId) return "No deal on this task.";

	const deal = await db.deal.findUnique({
		where: { id: task.dealId },
		select: {
			id: true,
			name: true,
			stage: true,
			companyId: true,
			ownerId: true,
			createdAt: true,
			lastActivityAt: true,
		},
	});

	if (!deal) return "The deal this names is gone.";
	if (isClosedStage(deal.stage)) return "The deal is closed.";

	const existing = await db.activity.findFirst({
		where: {
			dealId: deal.id,
			type: ActivityType.TASK,
			completedAt: null,
			meta: { path: ["source"], equals: STALLED_DEAL.source },
		},
		select: { id: true },
	});

	if (existing) return "Owner already has an open stalled-deal task.";

	const now = new Date();
	const days = daysInactive({
		lastActivityAt: deal.lastActivityAt,
		createdAt: deal.createdAt,
		now,
	});

	await db.activity.create({
		data: {
			type: ActivityType.TASK,
			subject: stallTaskSubject(deal.name),
			body: task.reason,
			occurredAt: now,
			dueAt: now,
			companyId: deal.companyId,
			dealId: deal.id,
			createdById: deal.ownerId,
			meta: {
				source: STALLED_DEAL.source,
				daysInactive: days,
			},
		},
	});

	return "Raised an owner task for the stalled deal.";
}
