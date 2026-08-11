import { type Prisma, type SubjectType } from "@crm/db";
import { Injectable } from "@nestjs/common";
import type { SubjectRef } from "./operating-kernel.contracts";

@Injectable()
export class OperatingKernelCleanupService {
	async beforeSubjectDelete(
		client: Prisma.TransactionClient,
		ref: SubjectRef,
	): Promise<void> {
		const now = new Date();
		const subjectType = ref.type as SubjectType;
		await client.approvalRequest.updateMany({
			where: {
				status: "PENDING",
				targetType: subjectType,
				targetId: ref.id,
			},
			data: {
				status: "INVALIDATED",
				invalidationVersion: { increment: 1 },
				version: { increment: 1 },
				decidedAt: now,
			},
		});

		const activeWork = await client.workItem.findMany({
			where: {
				subjectType,
				subjectId: ref.id,
				state: { notIn: ["DONE", "DISMISSED"] },
			},
			select: { id: true, evidence: true },
		});

		for (const work of activeWork) {
			const evidence =
				work.evidence &&
				typeof work.evidence === "object" &&
				!Array.isArray(work.evidence)
					? { ...(work.evidence as Record<string, unknown>) }
					: { previousEvidence: work.evidence ?? null };
			await client.workItem.updateMany({
				where: { id: work.id, state: { notIn: ["DONE", "DISMISSED"] } },
				data: {
					state: "DISMISSED",
					nextReviewAt: null,
					completedAt: now,
					version: { increment: 1 },
					evidence: {
						...evidence,
						cleanupReason: "SUBJECT_DELETED",
						cleanupAt: now.toISOString(),
					} as Prisma.InputJsonValue,
				},
			});
		}

		await client.agentTask.updateMany({
			where: {
				subjectType,
				subjectId: ref.id,
				state: { notIn: ["SUCCEEDED", "FAILED", "UNKNOWN", "CANCELLED"] },
			},
			data: {
				state: "CANCELLED",
				finishedAt: now,
				outcome: "SUBJECT_DELETED",
			},
		});
	}
}
