"use client";

import { AttendeeList } from "@crm/ui/components/attendee-list";
import { useQuery } from "@tanstack/react-query";
import {
	LocalDateTime,
	LocalDateTimeRange,
} from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

const RANGE_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
};

const DAY_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
};

export function MeetingEntry({
	eventId,
	startsAt,
	endsAt,
	isAllDay,
	attendeeCount,
	conferenceUrl,
}: {
	eventId: string;
	startsAt: string;
	endsAt: string;
	isAllDay: boolean;
	attendeeCount: number;
	conferenceUrl: string | null;
}) {
	const trpc = useTRPC();

	const event = useQuery({
		...trpc.google.event.queryOptions({ eventId }),
		enabled: attendeeCount > 0,
	});

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
			<span className="text-muted-foreground text-xs">
				{isAllDay ? (
					<>
						<LocalDateTime date={startsAt} options={DAY_OPTIONS} /> · All day
					</>
				) : (
					<LocalDateTimeRange
						start={startsAt}
						end={endsAt}
						options={RANGE_OPTIONS}
					/>
				)}
			</span>

			{event.data?.attendees && event.data.attendees.length > 0 ? (
				<AttendeeList attendees={event.data.attendees} />
			) : null}

			{conferenceUrl ? (
				<a
					href={conferenceUrl}
					target="_blank"
					rel="noreferrer"
					className="text-muted-foreground text-xs underline underline-offset-3 hover:text-foreground"
				>
					Join call
				</a>
			) : null}
		</div>
	);
}
