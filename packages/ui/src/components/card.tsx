import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

function Card({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card"
			className={cn("flex flex-col gap-3", className)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-header"
			className={cn(
				"@container/card-header grid auto-rows-min items-center gap-x-4 gap-y-1 has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto] sm:has-data-[slot=card-description]:grid-rows-[auto_auto]",
				className,
			)}
			{...props}
		/>
	);
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-title"
			className={cn("text-pretty text-sm font-medium", className)}
			{...props}
		/>
	);
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-description"
			className={cn(
				"hidden text-pretty text-xs/relaxed text-muted-foreground sm:block",
				className,
			)}
			{...props}
		/>
	);
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-action"
			className={cn(
				"col-start-2 row-span-2 row-start-1 flex items-center gap-2 self-center justify-self-end",
				className,
			)}
			{...props}
		/>
	);
}

function CardToolbar({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-toolbar"
			className={cn("flex flex-wrap items-center gap-2", className)}
			{...props}
		/>
	);
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-content"
			className={cn(
				"flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6",
				className,
			)}
			{...props}
		/>
	);
}

const cardPanelVariants = cva(
	"flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card",
	{
		variants: {
			size: {
				scroll: "h-80 sm:h-(--height-tool-panel)",
				content: "h-auto max-h-80 sm:max-h-(--height-tool-panel)",
			},
		},
		defaultVariants: { size: "scroll" },
	},
);

function CardPanel({
	className,
	size,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardPanelVariants>) {
	return (
		<div
			data-slot="card-panel"
			className={cn(cardPanelVariants({ size }), className)}
			{...props}
		/>
	);
}

function CardPanelEmpty({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-panel-empty"
			className={cn(
				"flex flex-1 items-center justify-center p-6 text-center text-muted-foreground text-xs",
				className,
			)}
			{...props}
		/>
	);
}

function CardPanelScroll({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-panel-scroll"
			className={cn(
				"flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain",
				className,
			)}
			{...props}
		/>
	);
}

function CardPanelGroup({ className, ...props }: React.ComponentProps<"section">) {
	return (
		<section
			data-slot="card-panel-group"
			className={cn("flex flex-col not-first:border-t", className)}
			{...props}
		/>
	);
}

function CardPanelGroupHeader({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-panel-group-header"
			className={cn(
				"sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-muted px-4 py-3 md:px-6",
				className,
			)}
			{...props}
		/>
	);
}

function CardPanelGroupContent({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-panel-group-content"
			className={cn("px-4 pb-3 md:px-6", className)}
			{...props}
		/>
	);
}

function CardPanelDetail({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-panel-detail"
			className={cn(
				"flex w-full flex-col gap-3 rounded-md bg-muted p-3 text-muted-foreground text-xs/5",
				className,
			)}
			{...props}
		/>
	);
}

const cardFooterVariants = cva("flex items-center gap-3", {
	variants: {
		align: {
			start: "justify-start",
			end: "justify-end",
			between: "justify-between",
		},
		divider: {
			top: "border-t pt-4",
			none: "",
		},
	},
	defaultVariants: { align: "start", divider: "top" },
});

function CardFooter({
	className,
	align,
	divider,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardFooterVariants>) {
	return (
		<div
			data-slot="card-footer"
			className={cn(cardFooterVariants({ align, divider }), className)}
			{...props}
		/>
	);
}

export {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardPanel,
	CardPanelDetail,
	CardPanelEmpty,
	CardPanelGroup,
	CardPanelGroupContent,
	CardPanelGroupHeader,
	CardPanelScroll,
	CardTitle,
	CardToolbar,
};
