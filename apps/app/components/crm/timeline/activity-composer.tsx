"use client";

import Calendar from "@carbon/icons-react/es/Calendar";
import { Calendar as DayPicker } from "@crm/ui/components/calendar";
import { Icon } from "@crm/ui/components/icon";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@crm/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { activityLabel } from "@/lib/activity-presentation";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { ActivityIcon } from "./activity-icon";
import type { TimelineAnchor } from "./timeline";

const TYPES = ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"] as const;

type ComposableType = (typeof TYPES)[number];

const dueFormat = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
});

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
	const [dueAt, setDueAt] = useState<Date | undefined>(undefined);

	const isTask = type === "TASK";
	const text = draft.trim();

	const reset = () => {
		setDraft("");
		setDueAt(undefined);
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
			dueAt: isTask ? (dueAt?.toISOString() ?? null) : undefined,
		});
	};

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<InputGroup>
				<InputGroupTextarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder={PLACEHOLDER[type]}
					aria-label="What happened"
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							submit();
						}
						if (event.key === "Escape") reset();
					}}
				/>

				<InputGroupAddon align="block-end" className="gap-2 border-t">
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

					{isTask ? (
						<Popover>
							<PopoverTrigger asChild>
								<InputGroupButton variant="ghost" size="xs">
									<Icon icon={Calendar} data-icon="inline-start" />
									{dueAt ? dueFormat.format(dueAt) : "Due date"}
								</InputGroupButton>
							</PopoverTrigger>
							<PopoverContent size="fit" align="start">
								<DayPicker
									mode="single"
									selected={dueAt}
									onSelect={setDueAt}
									autoFocus
								/>
							</PopoverContent>
						</Popover>
					) : null}

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
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
}
