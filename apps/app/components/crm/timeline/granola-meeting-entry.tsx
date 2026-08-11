"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
import { AttendeeList } from "@crm/ui/components/attendee-list";
import { Markdown } from "@crm/ui/components/markdown";
import { Skeleton } from "@crm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LocalDateTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
};

export function GranolaMeetingEntry({
	activityId,
	noteCount,
}: {
	activityId: string;
	noteCount: number;
}) {
	const trpc = useTRPC();
	const [opened, setOpened] = useState(false);
	const notes = useQuery({
		...trpc.activities.granolaNotes.queryOptions({ activityId }),
		enabled: opened,
	});

	return (
		<Accordion
			type="single"
			collapsible
			onValueChange={(value) => {
				if (value) setOpened(true);
			}}
		>
			<AccordionItem value={activityId}>
				<AccordionTrigger variant="subtle">
					{noteCount === 1
						? "Granola call notes"
						: `${noteCount} Granola notes`}
				</AccordionTrigger>

				<AccordionContent>
					{notes.isPending ? (
						<div className="flex flex-col gap-2">
							<Skeleton className="h-4 w-1/3" />
							<Skeleton className="h-4 w-2/3" />
						</div>
					) : notes.isError ? (
						<p className="text-muted-foreground text-xs">
							{notes.error.message}
						</p>
					) : (
						<div className="flex flex-col gap-5">
							{notes.data?.map((note) => (
								<GranolaNote key={note.id} note={note} />
							))}
						</div>
					)}
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}

function GranolaNote({
	note,
}: {
	note: {
		id: string;
		title: string;
		sourceUrl: string | null;
		ownerName: string | null;
		ownerEmail: string | null;
		summary: string | null;
		startedAt: string | null;
		attendees: { name: string | null; email: string }[];
		transcript: {
			text: string;
			speaker?: {
				attribution?: { name?: string | null; email?: string | null } | null;
			} | null;
		}[];
	};
}) {
	const attendees = note.attendees.map((attendee) => ({
		id: attendee.email,
		email: attendee.email,
		name: attendee.name,
		responseStatus: null,
		isOrganizer: attendee.email === note.ownerEmail,
	}));
	const transcript = transcriptBlocks(note.transcript);

	return (
		<section className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="font-medium text-sm">{note.title}</p>
					<p className="text-muted-foreground text-xs">
						{note.ownerName ?? note.ownerEmail ?? "Granola"}
						{note.startedAt ? (
							<>
								{" · "}
								<LocalDateTime date={note.startedAt} options={DATE_OPTIONS} />
							</>
						) : null}
					</p>
				</div>
				{note.sourceUrl ? (
					<a
						href={note.sourceUrl}
						target="_blank"
						rel="noreferrer"
						className="text-muted-foreground text-xs underline underline-offset-3 hover:text-foreground"
					>
						Open in Granola
					</a>
				) : null}
			</div>

			<AttendeeList attendees={attendees} />

			{note.summary ? (
				<Markdown className="wrap-break-word text-sm leading-5">
					{note.summary}
				</Markdown>
			) : null}

			{transcript.length > 0 ? (
				<Accordion type="single" collapsible>
					<AccordionItem value={`${note.id}-transcript`}>
						<AccordionTrigger variant="subtle">
							Transcript · {note.transcript.length.toLocaleString()} segments
						</AccordionTrigger>
						<AccordionContent>
							<div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
								{transcript.map((block) => (
									<p
										key={`${block.speaker}-${block.text}`}
										className="leading-5"
									>
										<span className="font-medium">{block.speaker}: </span>
										{block.text}
									</p>
								))}
							</div>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			) : null}
		</section>
	);
}

function transcriptBlocks(
	segments: {
		text: string;
		speaker?: {
			attribution?: { name?: string | null; email?: string | null } | null;
		} | null;
	}[],
): { speaker: string; text: string }[] {
	const blocks: { speaker: string; text: string }[] = [];
	for (const segment of segments) {
		const speaker =
			segment.speaker?.attribution?.name ??
			segment.speaker?.attribution?.email ??
			"Speaker";
		const previous = blocks.at(-1);
		if (previous?.speaker === speaker) {
			previous.text = `${previous.text} ${segment.text}`.trim();
		} else {
			blocks.push({ speaker, text: segment.text.trim() });
		}
	}
	return blocks.filter((block) => block.text);
}
