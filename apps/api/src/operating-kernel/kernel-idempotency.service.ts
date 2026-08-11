import { createHash } from "node:crypto";
import { type Prisma } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { ConflictException, Injectable } from "@nestjs/common";
import type { KernelDb } from "./operating-kernel-access.service";

const KERNEL_PROVIDER = "crm";
const KERNEL_CHANNEL = "operating-kernel";

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalize(entry)]),
		);
	}
	return value;
}

export function kernelRequestHash(value: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(canonicalize(value)))
		.digest("hex");
}

@Injectable()
export class KernelIdempotencyService {
	async lock(client: Prisma.TransactionClient, key: string): Promise<void> {
		await lockIdempotencyKey(client, key);
	}

	async replay<T>(
		client: KernelDb,
		key: string,
		requestHash: string,
	): Promise<T | null> {
		const receipt = await client.actionReceipt.findUnique({
			where: { idempotencyKey: key },
			select: {
				provider: true,
				channel: true,
				requestHash: true,
				status: true,
				result: true,
			},
		});

		if (!receipt) return null;
		if (
			receipt.provider !== KERNEL_PROVIDER ||
			receipt.channel !== KERNEL_CHANNEL ||
			receipt.requestHash !== requestHash
		) {
			throw new ConflictException(
				"That client request id has already been used.",
			);
		}
		if (receipt.status !== "SUCCEEDED" || receipt.result == null) {
			throw new ConflictException("That client request is not replayable.");
		}

		return receipt.result as T;
	}

	async record(
		client: Prisma.TransactionClient,
		input: {
			key: string;
			requestHash: string;
			operation: string;
			result: Record<string, unknown>;
		},
	): Promise<void> {
		await client.actionReceipt.create({
			data: {
				idempotencyKey: input.key,
				requestHash: input.requestHash,
				provider: KERNEL_PROVIDER,
				channel: KERNEL_CHANNEL,
				operationKey: input.operation,
				status: "SUCCEEDED",
				result: input.result as Prisma.InputJsonValue,
				completedAt: new Date(),
			},
		});
	}
}
