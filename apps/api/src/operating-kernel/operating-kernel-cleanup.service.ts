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
		const subjectType: SubjectType = ref.type;
		await client.approvalRequest.updateMany({
			where: {
				status: { in: ["PENDING", "APPROVED"] },
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

		const legacyWhere: Prisma.AgentTaskWhereInput | undefined =
			subjectType === "COMPANY"
				? { companyId: ref.id }
				: subjectType === "CONTACT"
					? { contactId: ref.id }
					: subjectType === "DEAL"
						? { dealId: ref.id }
						: subjectType === "EMAIL_DRAFT"
							? { emailDraftId: ref.id }
							: undefined;
		await client.agentTask.updateMany({
			where: {
				state: {
					notIn: ["SUCCEEDED", "FAILED", "UNKNOWN", "CANCELLED"],
				},
				OR: [
					{ subjectType, subjectId: ref.id },
					...(legacyWhere ? [legacyWhere] : []),
				],
			},
			data: {
				state: "CANCELLED",
				finishedAt: now,
				outcome: "SUBJECT_DELETED",
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
	}
	async beforeCompanyDelete(
		client: Prisma.TransactionClient,
		companyId: string,
	): Promise<void> {
		const [contacts, deals] = await Promise.all([
			client.contact.findMany({
				where: { companyId },
				select: { id: true },
			}),
			client.deal.findMany({
				where: { companyId },
				select: { id: true },
			}),
		]);

		await this.beforeSubjectDelete(client, { type: "COMPANY", id: companyId });
		for (const contact of contacts) {
			await this.beforeSubjectDelete(client, {
				type: "CONTACT",
				id: contact.id,
			});
		}
		for (const deal of deals) {
			await this.beforeSubjectDelete(client, { type: "DEAL", id: deal.id });
		}
	}
}
