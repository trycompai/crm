import { Bubble, BubbleContent } from "@crm/ui/components/bubble";
import { Message, MessageContent } from "@crm/ui/components/message";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

export type ChatMessageAuthor = "user" | "assistant";

export function ChatMessage({
	author,
	children,
	sending = false,
	error,
}: {
	author: ChatMessageAuthor;
	children: React.ReactNode;
	sending?: boolean;
	error?: React.ReactNode;
}) {
	if (author === "user") {
		return (
			<Message
				align="end"
				className={cn("transition-opacity", sending && "opacity-70")}
				aria-busy={sending}
				data-author="user"
			>
				<MessageContent>
					<Bubble align="end" variant="muted">
						<BubbleContent className="whitespace-pre-wrap">
							{children}
						</BubbleContent>
					</Bubble>
					{error ? (
						<div className="wrap-break-word text-destructive text-xs/5" role="alert">
							{error}
						</div>
					) : null}
				</MessageContent>
			</Message>
		);
	}

	return (
		<Message data-author="assistant">
			<MessageContent className="max-w-2xl gap-3">
				{children}
				{error ? (
					<div className="wrap-break-word text-destructive text-xs/5" role="alert">
						{error}
					</div>
				) : null}
			</MessageContent>
		</Message>
	);
}
