import type { Prisma } from "@crm/db";

/**
 * Put threads back together after some of their messages were purged.
 *
 * Counts, first/last timestamps and the activity preview are all derived from
 * the messages a thread holds, so deleting one provider's messages out of a
 * mixed thread leaves those fields lying. Every provider's purge needs this,
 * which is why it lives here rather than beside any one of them.
 */
export async function rebuildThreads(
	tx: Prisma.TransactionClient,
	threadIds: string[],
): Promise<void> {
	if (threadIds.length === 0) return;

	const remaining = await tx.emailMessage.findMany({
		where: { threadId: { in: threadIds } },
		select: { threadId: true, sentAt: true, subject: true, snippet: true },
		orderBy: { sentAt: "asc" },
	});

	const byThread = new Map<string, typeof remaining>();

	for (const message of remaining) {
		const group = byThread.get(message.threadId);
		if (group) group.push(message);
		else byThread.set(message.threadId, [message]);
	}

	for (const [threadId, messages] of byThread) {
		const first = messages.at(0);
		const last = messages.at(-1);
		if (!first || !last) continue;

		await tx.emailThread.update({
			where: { id: threadId },
			data: {
				messageCount: messages.length,
				firstMessageAt: first.sentAt,
				lastMessageAt: last.sentAt,
				subject: first.subject,
			},
		});

		await tx.activity.updateMany({
			where: { emailThreadId: threadId },
			data: { body: last.snippet, occurredAt: last.sentAt },
		});
	}
}
