"use client";

import ArrowUp from "@carbon/icons-react/es/ArrowUp";
import StopFilled from "@carbon/icons-react/es/StopFilled";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupTextarea,
} from "@crm/ui/components/input-group";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

export type ChatComposerSize = "page" | "panel";

export const CHAT_COMPOSER_SURFACE_CLASS_NAME =
	"flex w-full flex-col justify-between rounded-xl border border-border bg-background p-[11px] transition-[color,background-color,border-color,box-shadow] focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/40";

export function ChatComposer({
	value,
	onValueChange,
	onSubmit,
	onStop,
	busy = false,
	disabled = false,
	size = "page",
	tools,
	placeholder = "Ask a question…",
	label = "Message",
	sendLabel = "Send message",
	stopLabel = "Stop reply",
	busyLabel = "Reply in progress",
}: {
	value: string;
	onValueChange: (value: string) => void;
	onSubmit: (value: string) => void;
	onStop?: () => void;
	busy?: boolean;
	disabled?: boolean;
	size?: ChatComposerSize;
	tools?: React.ReactNode;
	placeholder?: string;
	label?: string;
	sendLabel?: string;
	stopLabel?: string;
	busyLabel?: string;
}) {
	const text = value.trim();
	const canSend = text.length > 0 && !busy && !disabled;

	function submit() {
		if (canSend) onSubmit(text);
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key !== "Enter" || event.shiftKey) return;
		if (event.nativeEvent.isComposing) return;

		event.preventDefault();
		submit();
	}

	return (
		<form
			className="w-full"
			data-slot="chat-composer"
			data-size={size}
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<InputGroup
				className={cn(
					CHAT_COMPOSER_SURFACE_CLASS_NAME,
					"h-auto p-0 has-[[data-slot=input-group-control]:focus-visible]:shadow-none!",
				)}
			>
				<InputGroupTextarea
					aria-label={label}
					className={cn(
						"max-h-60 px-3 pt-3 text-sm",
						size === "page" ? "min-h-14" : "min-h-10",
					)}
					disabled={disabled}
					onChange={(event) => onValueChange(event.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					value={value}
				/>
				<InputGroupAddon
					align="block-end"
					className="cursor-default justify-between gap-2 px-2 pb-2"
				>
					<div className="flex min-w-0 items-center gap-1">{tools}</div>
					{busy && onStop ? (
						<Button aria-label={stopLabel} onClick={onStop} size="icon-sm" type="button">
							<Icon icon={StopFilled} motion="none" />
						</Button>
					) : (
						<Button
							aria-label={busy ? busyLabel : sendLabel}
							disabled={!canSend}
							size="icon-sm"
							type="submit"
						>
							{busy ? <Spinner /> : <Icon icon={ArrowUp} motion="none" />}
						</Button>
					)}
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
}
