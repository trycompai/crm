"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import { Icon } from "@crm/ui/components/icon";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@crm/ui/components/message-scroller";
import { cn } from "@crm/ui/lib/utils";
import { createContext, type ReactNode, useContext } from "react";

export type ChatThreadSize = "page" | "panel";

const SizeContext = createContext<ChatThreadSize>("page");

export function ChatThread({
	size,
	children,
	composer,
	empty,
	suggestions,
	notice,
	busy = false,
	label = "Messages",
}: {
	size: ChatThreadSize;
	children?: ReactNode;
	composer?: ReactNode;
	empty?: ReactNode;
	suggestions?: ReactNode;
	notice?: ReactNode;
	busy?: boolean;
	label?: string;
}) {
	const page = size === "page";
	const footer = composer || notice ? (
		<div
			className={cn(
				"flex shrink-0 flex-col gap-2",
				page ? "pb-4 sm:pb-6" : "border-t p-3",
			)}
			data-slot="chat-thread-composer"
		>
			<div
				className={cn(
					"flex w-full flex-col gap-2",
					page && "mx-auto max-w-3xl px-4 sm:px-6",
				)}
			>
				{notice}
				{composer}
			</div>
		</div>
	) : null;

	if (empty && page) {
		return (
			<SizeContext value={size}>
				<div
					className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10 sm:px-6"
					data-size={size}
					data-slot="chat-thread"
				>
					<div className="flex w-full max-w-3xl flex-col gap-6">
						{empty}
						<div className="flex flex-col gap-2">
							{notice}
							{composer}
						</div>
						{suggestions}
					</div>
				</div>
			</SizeContext>
		);
	}

	return (
		<SizeContext value={size}>
			<div
				className="flex min-h-0 flex-1 flex-col"
				data-size={size}
				data-slot="chat-thread"
			>
				{empty ? (
					<div className="flex min-h-0 flex-1 flex-col justify-center gap-5 overflow-y-auto p-4">
						{empty}
						{suggestions}
					</div>
				) : (
					<MessageScrollerProvider autoScroll defaultScrollPosition="end">
						<MessageScroller className="flex-1">
							<MessageScrollerViewport
								aria-label={label}
								aria-relevant="additions text"
								role="log"
							>
								<MessageScrollerContent
									aria-busy={busy}
									className={cn(
										page
											? "mx-auto w-full max-w-3xl gap-6 px-4 py-6 sm:px-6 sm:py-9"
											: "gap-4 p-4",
									)}
								>
									{children}
								</MessageScrollerContent>
							</MessageScrollerViewport>
							<MessageScrollerButton />
						</MessageScroller>
					</MessageScrollerProvider>
				)}
				{footer}
			</div>
		</SizeContext>
	);
}

export function ChatThreadItem({
	id,
	children,
	scrollAnchor = false,
}: {
	id: string;
	children: ReactNode;
	scrollAnchor?: boolean;
}) {
	return (
		<MessageScrollerItem
			className="p-px"
			messageId={id}
			scrollAnchor={scrollAnchor}
		>
			{children}
		</MessageScrollerItem>
	);
}

export function ChatEmptyState({
	title,
	description,
}: {
	title: string;
	description?: string;
}) {
	const size = useContext(SizeContext);
	const page = size === "page";

	return (
		<div
			className={cn(
				"flex flex-col gap-2",
				page ? "items-center text-center" : "items-start",
			)}
			data-slot="chat-empty-state"
		>
			<h2
				className={cn(
					"text-balance font-semibold tracking-tight",
					page ? "text-2xl sm:text-3xl" : "text-base",
				)}
			>
				{title}
			</h2>
			{description ? (
				<p
					className={cn(
						"text-balance text-muted-foreground text-sm",
						page && "max-w-xl",
					)}
				>
					{description}
				</p>
			) : null}
		</div>
	);
}

export function ChatSuggestions({
	label,
	suggestions,
	onSelect,
}: {
	label?: string;
	suggestions: readonly string[];
	onSelect: (suggestion: string) => void;
}) {
	return (
		<div className="flex flex-col" data-slot="chat-suggestions">
			{label ? (
				<p className="flex h-7 items-center text-muted-foreground text-xs">
					{label}
				</p>
			) : null}
			<ul className="flex flex-col">
				{suggestions.map((suggestion) => (
					<li className="border-t" key={suggestion}>
						<button
							className="group/suggestion flex min-h-10 w-full items-center gap-3 rounded-sm py-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/60"
							onClick={() => onSelect(suggestion)}
							type="button"
						>
							<span className="min-w-0 flex-1 font-medium text-sm">
								{suggestion}
							</span>
							<Icon className="text-muted-foreground" icon={ArrowRight} />
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}
