import { Button } from "@crm/ui/components/button";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function TokenField({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="token-field"
			role="group"
			className={cn(
				"flex min-h-6 w-full min-w-0 flex-wrap items-start gap-1",
				className,
			)}
			{...props}
		/>
	);
}

function TokenFieldControl({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="token-field-control"
			className={cn("relative grid min-w-32 flex-1 basis-40", className)}
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
				"flex h-6 min-w-0 max-w-full shrink-0 items-center gap-1 rounded-lg bg-tag py-0 pr-0.5 pl-0.5 text-left text-tag-foreground text-xs",
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

export { TokenField, TokenFieldAction, TokenFieldControl, TokenFieldItem };
