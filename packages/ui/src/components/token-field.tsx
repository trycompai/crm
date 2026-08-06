import { Button } from "@crm/ui/components/button";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function TokenField({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="token-field"
			role="group"
			className={cn(
				"max-h-40 min-h-6 w-full min-w-0 cursor-text overflow-y-auto whitespace-pre-wrap break-words px-1 text-base leading-6 outline-none data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-muted-foreground data-[empty=true]:before:content-[attr(data-placeholder)] aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:text-[15px] md:text-xs [&>[contenteditable]]:outline-none",
				className,
			)}
			{...props}
		/>
	);
}

function TokenFieldItem({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="token-field-item"
			className={cn(
				"inline-flex h-6 min-w-0 max-w-full shrink-0 items-center gap-1 rounded-lg bg-tag py-0 pr-0.5 pl-0.5 align-middle text-left text-tag-foreground text-xs",
				className,
			)}
			{...props}
		/>
	);
}

function TokenFieldAction({
	className,
	...props
}: React.ComponentProps<typeof Button>) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			className={cn("size-5 rounded-lg", className)}
			{...props}
		/>
	);
}

export { TokenField, TokenFieldAction, TokenFieldItem };
