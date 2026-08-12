"use client";

import { InputGroupButton } from "@crm/ui/components/input-group";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { ActivityForm } from "./activity-form";
import { DueDateButton } from "./due-date-button";
import type { TimelineEntryData } from "./timeline-entry";

export function TaskEditor({
	task,
	onClose,
}: {
	task: Pick<TimelineEntryData, "id" | "subject" | "dueAt">;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [draft, setDraft] = useState(task.subject ?? "");
	const [dueAt, setDueAt] = useState(task.dueAt ?? "");

	const update = useMutation(
		trpc.activities.update.mutationOptions({
			onSuccess: async () => {
				await cache.activity({ settle: "record" });
				onClose();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const text = draft.trim();

	const submit = () => {
		if (text === "" || update.isPending) return;
		update.mutate({
			id: task.id,
			subject: text,
			dueAt: dueAt || null,
		});
	};

	return (
		<ActivityForm
			value={draft}
			onValueChange={setDraft}
			ariaLabel="What needs doing"
			autoFocus
			onSubmit={submit}
			onEscape={onClose}
		>
			<DueDateButton
				value={dueAt}
				onChange={setDueAt}
				disabled={update.isPending}
			/>

			<InputGroupButton
				variant="ghost"
				size="xs"
				className="ml-auto"
				disabled={update.isPending}
				onClick={onClose}
			>
				Cancel
			</InputGroupButton>

			<InputGroupButton
				type="submit"
				variant="default"
				size="xs"
				disabled={text === "" || update.isPending}
			>
				{update.isPending ? <Spinner /> : null}
				Save
			</InputGroupButton>
		</ActivityForm>
	);
}
