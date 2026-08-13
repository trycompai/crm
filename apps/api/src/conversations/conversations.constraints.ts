import { Prisma as PrismaNamespace } from "@crm/db";
import { z } from "zod";

export const CONVERSATION_CONSTRAINTS = {
	campaignNodeForeignKey: "agentConversation_campaignNodeId_fkey",
	campaignNodeColumn: "campaignNodeId",
} as const;

export type ViolatedForeignKey = "campaignNode" | "other";

const foreignKeyMeta = z.object({
	driverAdapterError: z.object({
		cause: z.object({
			constraint: z
				.union([
					z.object({ index: z.string() }),
					z.object({ fields: z.array(z.string()) }),
				])
				.optional(),
		}),
	}),
});

export function violatedForeignKey(error: unknown): ViolatedForeignKey | null {
	if (
		!(error instanceof PrismaNamespace.PrismaClientKnownRequestError) ||
		error.code !== "P2003"
	) {
		return null;
	}

	const meta = foreignKeyMeta.safeParse(error.meta);
	if (!meta.success) return "other";

	const { constraint } = meta.data.driverAdapterError.cause;
	if (!constraint) return "other";

	const campaignNode =
		"index" in constraint
			? constraint.index === CONVERSATION_CONSTRAINTS.campaignNodeForeignKey
			: constraint.fields.includes(CONVERSATION_CONSTRAINTS.campaignNodeColumn);

	return campaignNode ? "campaignNode" : "other";
}
