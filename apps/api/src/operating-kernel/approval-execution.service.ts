import { type Db, type Prisma } from "@crm/db";
import { ConflictException, Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

export type ConsumeApprovedInput = {
	approvalRequestId: string;
	contentDigest: string;
	expectedVersion: number;
	invalidationVersion: number;
	actionReceiptId: string;
};

@Injectable()
export class ApprovalExecutionService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async consumeApproved(input: ConsumeApprovedInput) {
		const result = await this.db.$transaction(async (tx) => {
			await tx.$queryRaw`
				SELECT id
				FROM "approvalRequest"
				WHERE id = ${input.approvalRequestId}
				FOR UPDATE
			`;

			const request = await tx.approvalRequest.findUnique({
				where: { id: input.approvalRequestId },
				select: {
					id: true,
					contentDigest: true,
					expiresAt: true,
					invalidationVersion: true,
					version: true,
					status: true,
				},
			});
			if (!request)
				throw new ConflictException("Approval request is unavailable.");

			if (
				request.status === "EXECUTED" &&
				request.contentDigest === input.contentDigest &&
				request.version === input.expectedVersion + 1 &&
				request.invalidationVersion === input.invalidationVersion
			) {
				await this.assertMatchingReceipt(tx, input);
				return {
					id: request.id,
					status: request.status,
					version: request.version,
				};
			}

			if (request.status !== "APPROVED") {
				if (request.status === "PENDING" && request.expiresAt <= new Date()) {
					await tx.approvalRequest.updateMany({
						where: {
							id: request.id,
							status: "PENDING",
							version: request.version,
						},
						data: { status: "EXPIRED", version: { increment: 1 } },
					});
					return { expired: true as const };
				}
				throw new ConflictException("Approval request is not executable.");
			}
			if (request.contentDigest !== input.contentDigest) {
				throw new ConflictException("Approval content is stale.");
			}
			if (request.version !== input.expectedVersion) {
				throw new ConflictException("Approval version is stale.");
			}
			if (request.invalidationVersion !== input.invalidationVersion) {
				throw new ConflictException("Approval invalidation is stale.");
			}
			if (request.expiresAt <= new Date()) {
				await tx.approvalRequest.updateMany({
					where: {
						id: request.id,
						status: "APPROVED",
						version: request.version,
					},
					data: { status: "EXPIRED", version: { increment: 1 } },
				});
				return { expired: true as const };
			}

			await this.assertMatchingReceipt(tx, input);

			const updated = await tx.approvalRequest.updateMany({
				where: {
					id: request.id,
					status: "APPROVED",
					contentDigest: input.contentDigest,
					version: input.expectedVersion,
					invalidationVersion: input.invalidationVersion,
					expiresAt: { gt: new Date() },
				},
				data: { status: "EXECUTED", version: { increment: 1 } },
			});
			if (updated.count !== 1) {
				throw new ConflictException(
					"Approval request changed during execution.",
				);
			}

			return {
				id: request.id,
				status: "EXECUTED" as const,
				version: input.expectedVersion + 1,
			};
		});
		if ("expired" in result) {
			throw new ConflictException("Approval request has expired.");
		}
		return result;
	}

	private async assertMatchingReceipt(
		tx: Prisma.TransactionClient,
		input: ConsumeApprovedInput,
	): Promise<void> {
		const receipt = await tx.actionReceipt.findFirst({
			where: {
				id: input.actionReceiptId,
				approvalRequestId: input.approvalRequestId,
				requestHash: input.contentDigest,
				status: "SUCCEEDED",
			},
			select: { id: true },
		});
		if (!receipt) {
			throw new ConflictException(
				"A matching successful action receipt is required.",
			);
		}
	}
}
