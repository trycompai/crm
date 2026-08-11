import { createHash } from "node:crypto";

export type ApprovalDigestInput = {
	action: string;
	contentSnapshot: unknown;
	targetType: string;
	targetId: string;
	risk: string;
	policyVersion: string;
	expiresAt: Date | string;
	invalidationVersion: number;
};

function canonicalize(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
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

export function approvalContentDigest(input: ApprovalDigestInput): string {
	return createHash("sha256")
		.update(
			JSON.stringify(
				canonicalize({
					action: input.action,
					contentSnapshot: input.contentSnapshot,
					targetType: input.targetType,
					targetId: input.targetId,
					risk: input.risk,
					policyVersion: input.policyVersion,
					expiresAt: input.expiresAt,
					invalidationVersion: input.invalidationVersion,
				}),
			),
		)
		.digest("hex");
}
