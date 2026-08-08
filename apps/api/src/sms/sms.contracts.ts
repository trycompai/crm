import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const smsThreadListInput = listInput.extend({
	unread: z.enum(["all", "unread"]).default("all"),
	clientAccountId: z.string().default("all"),
});

export type SmsThreadListInput = z.infer<typeof smsThreadListInput>;

export const smsThreadIdInput = z.object({ id: z.string() });

export const smsSendInput = z.object({
	to: z.string().trim().min(4),
	body: z.string().trim().min(1).max(1600),
	contactId: z.string().optional(),
	clientAccountId: z.string().optional(),
});

export type SmsSendInput = z.infer<typeof smsSendInput>;

export const smsMarkReadInput = z.object({ threadId: z.string() });
