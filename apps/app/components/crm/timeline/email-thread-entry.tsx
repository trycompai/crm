"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
import { Skeleton } from "@crm/ui/components/skeleton";
import { ThreadMessage } from "@crm/ui/components/thread-message";
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

export function EmailThreadEntry({
	threadId,
	messageCount,
}: {
	threadId: string;
	messageCount: number;
}) {
	const trpc = useTRPC();
	const [opened, setOpened] = useState(false);

	const thread = useQuery({
		...trpc.google.thread.queryOptions({ threadId }),
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
			<AccordionItem value={threadId}>
				<AccordionTrigger variant="subtle">
					{messageCount === 1 ? "1 message" : `${messageCount} messages`}
				</AccordionTrigger>

				<AccordionContent>
					{thread.isPending ? (
						<div className="flex flex-col gap-2">
							<Skeleton className="h-4 w-1/3" />
							<Skeleton className="h-4 w-2/3" />
						</div>
					) : thread.isError ? (
						<p className="text-muted-foreground text-xs">
							{thread.error.message}
						</p>
					) : (
						<div className="flex flex-col">
							{thread.data?.messages.map((message) => (
								<ThreadMessage
									key={message.id}
									from={message.fromName ?? message.fromEmail}
									fromEmail={message.fromEmail}
									fromImageUrl={message.fromImageUrl}
									sentAt={
										<LocalDateTime
											date={message.sentAt}
											options={DATE_OPTIONS}
										/>
									}
									direction={message.direction}
									body={message.body}
									action={
										message.mailboxUrl ? (
											<a
												href={message.mailboxUrl}
												target="_blank"
												rel="noreferrer"
												className="text-muted-foreground underline underline-offset-3 hover:text-foreground"
											>
												Open in {message.mailboxName}
											</a>
										) : null
									}
								/>
							))}
						</div>
					)}
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
