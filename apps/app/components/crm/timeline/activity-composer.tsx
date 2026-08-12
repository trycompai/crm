"use client";

import { InputGroupButton } from "@crm/ui/components/input-group";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { activityLabel } from "@/lib/activity-presentation";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { ActivityForm } from "./activity-form";
import { ActivityIcon } from "./activity-icon";
import { DueDateButton } from "./due-date-button";
import type { TimelineAnchor } from "./timeline";

const TYPES = ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"] as const;

type ComposableType = (typeof TYPES)[number];

const PLACEHOLDER: Record<ComposableType, string> = {
	NOTE: "Log a note, call, email, meeting or task…",
	CALL: "What came out of the call?",
	EMAIL: "What was said?",
	MEETING: "What came out of the meeting?",
	TASK: "What needs doing?",
};

export function ActivityComposer({ anchor }: { anchor: TimelineAnchor }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [type, setType] = useState<ComposableType>("NOTE");
	const [draft, setDraft] = useState("");
	const [dueAt, setDueAt] = useState("");

	const isTask = type === "TASK";
	const text = draft.trim();

	const reset = () => {
		setDraft("");
		setDueAt("");
	};

	const create = useMutation(
		trpc.activities.create.mutationOptions({
			onSuccess: async () => {
				await cache.activity();
				reset();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const submit = () => {
		if (text === "" || create.isPending) return;
		create.mutate({
			...anchor,
			type,
			subject: isTask ? text : undefined,
			body: isTask ? undefined : text,
			dueAt: isTask ? dueAt || null : undefined,
		});
	};

	return (
		<ActivityForm
			value={draft}
			onValueChange={setDraft}
			placeholder={PLACEHOLDER[type]}
			ariaLabel="What happened"
			onSubmit={submit}
			onEscape={reset}
		>
			<ToggleGroup
				type="single"
				value={type}
				onValueChange={(next) => next && setType(next as ComposableType)}
				size="sm"
				spacing={0}
			>
				{TYPES.map((option) => (
					<ToggleGroupItem
						key={option}
						value={option}
						aria-label={activityLabel(option)}
					>
						<ActivityIcon type={option} />
						{activityLabel(option)}
					</ToggleGroupItem>
				))}
			</ToggleGroup>

			{isTask ? <DueDateButton value={dueAt} onChange={setDueAt} /> : null}

			{text === "" ? null : (
				<InputGroupButton
					type="submit"
					variant="default"
					size="xs"
					className="ml-auto"
					disabled={create.isPending}
				>
					{create.isPending ? <Spinner /> : null}
					{isTask ? "Add task" : `Log ${activityLabel(type).toLowerCase()}`}
				</InputGroupButton>
			)}
		</ActivityForm>
	);
}
