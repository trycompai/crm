import { db } from "@crm/db";
import { writeOwnerTask, writeTimelineNote } from "./crm";
import { lastEmployerChange } from "./facts";
import { daysFromNow, JOB_CHANGE } from "./recheck-config";

export type RaiseJobChangeInput = {
	contactId: string;
	moveToCompanyId?: string;
};

export type RaiseJobChangeResult =
	| {
			raised: false;
			reason: string;
	  }
	| {
			raised: true;
			from: string;
			to: string;
			moved: boolean;
			ownerNotified: boolean;
			noteId: string | null;
			taskId: string | null;
	  };

export async function raiseJobChange(
	input: RaiseJobChangeInput,
): Promise<RaiseJobChangeResult> {
	const { contactId, moveToCompanyId } = input;

	const change = await lastEmployerChange(contactId);
	if (!change) {
		return {
			raised: false,
			reason: "No employer change on the facts for this contact.",
		};
	}

	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: {
			firstName: true,
			lastName: true,
			ownerId: true,
			companyId: true,
		},
	});
	if (!contact) return { raised: false, reason: "No such contact." };

	const name = [contact.firstName, contact.lastName]
		.filter(Boolean)
		.join(" ");

	const subject = `${name} has moved to ${change.to}`;
	const body = [
		`${name} appears to have left ${change.from} for ${change.to}.`,
		change.sourceUrl ?? "",
		"",
		"Worth a conversation either way: a champion in a new seat is the",
		"warmest introduction there is, and their replacement at the old",
		"account is a relationship nobody owns yet.",
	]
		.filter(Boolean)
		.join("\n");

	const meta = {
		source: "job-change",
		from: change.from,
		to: change.to,
	};

	const noteId = await writeTimelineNote(contactId, subject, body, meta);

	const taskId = contact.ownerId
		? await writeOwnerTask(
				contactId,
				subject,
				body,
				daysFromNow(JOB_CHANGE.ownerTaskDueDays),
				meta,
			)
		: null;

	if (moveToCompanyId) {
		await db.contact.update({
			where: { id: contactId },
			data: { companyId: moveToCompanyId },
		});
	}

	return {
		raised: true,
		from: change.from,
		to: change.to,
		moved: Boolean(moveToCompanyId),
		ownerNotified: taskId !== null,
		noteId,
		taskId,
	};
}
