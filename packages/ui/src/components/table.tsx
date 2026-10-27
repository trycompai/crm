"use client";

import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function Table({
	className,
	containerClassName,
	overlay,
	...props
}: React.ComponentProps<"table"> & {
	containerClassName?: string;
	overlay?: React.ReactNode;
}) {
	return (
		<div
			data-slot="table-container"
			className={cn("relative w-full overflow-x-auto", containerClassName)}
		>
			<table
				data-slot="table"
				className={cn("w-full caption-bottom text-sm", className)}
				{...props}
			/>
			{overlay}
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return (
		<thead
			data-slot="table-header"
			className={cn("[&_tr]:border-b", className)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
	return (
		<tbody
			data-slot="table-body"
			className={cn("[&_tr:last-child]:border-0", className)}
			{...props}
		/>
	);
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
	return (
		<tfoot
			data-slot="table-footer"
			className={cn(
				"border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
				className,
			)}
			{...props}
		/>
	);
}

function TableRow({
	className,
	onClick,
	onKeyDown,
	tabIndex,
	...props
}: React.ComponentProps<"tr">) {
	return (
		<tr
			data-slot="table-row"
			tabIndex={tabIndex ?? (onClick ? 0 : undefined)}
			onClick={
				onClick
					? (event) => {
							event.currentTarget.focus();
							onClick(event);
						}
					: undefined
			}
			onKeyDown={(event) => {
				onKeyDown?.(event);
				if (
					onClick &&
					!event.defaultPrevented &&
					event.target === event.currentTarget &&
					(event.key === "Enter" || event.key === " ")
				) {
					event.preventDefault();
					event.currentTarget.click();
				}
			}}
			className={cn(
				"border-b outline-hidden transition-colors hover:bg-muted/50 focus-visible:not-in-data-pointer:outline-2 focus-visible:not-in-data-pointer:outline-solid focus-visible:not-in-data-pointer:-outline-offset-2 focus-visible:not-in-data-pointer:outline-ring has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				"h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
	return (
		<td
			data-slot="table-cell"
			className={cn(
				"p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
				className,
			)}
			{...props}
		/>
	);
}

function TableCaption({
	className,
	...props
}: React.ComponentProps<"caption">) {
	return (
		<caption
			data-slot="table-caption"
			className={cn("mt-4 text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

export {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
};
