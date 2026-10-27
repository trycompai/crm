"use client";

import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Textarea } from "@crm/ui/components/textarea";
import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="input-group"
			role="group"
			className={cn(
				"group/input-group relative flex h-9 w-full min-w-0 items-center rounded-md border border-border transition-[color,background-color,border-color,box-shadow] outline-none in-data-[slot=combobox-content]:shadow-none! hover:border-input has-[[data-slot=input-group-control]:disabled]:pointer-events-none has-[[data-slot=input-group-control]:disabled]:bg-muted has-[[data-slot=input-group-control]:disabled]:text-muted-foreground data-[disabled=true]:bg-muted data-[disabled=true]:text-muted-foreground has-[[data-slot=input-group-control]:focus-visible]:shadow-focus has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-4 has-[[data-slot][aria-invalid=true]]:ring-destructive/15 has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
				className,
			)}
			{...props}
		/>
	);
}

const inputGroupAddonVariants = cva(
	"flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm text-muted-foreground select-none group-data-[disabled=true]/input-group:bg-transparent group-has-[[data-slot=input-group-control]:disabled]/input-group:bg-transparent [&>svg:not([class*='size-'])]:size-3.5",
	{
		variants: {
			align: {
				"inline-start":
					"order-first pl-2.5 has-[>button]:-ml-1.5 has-[>kbd]:ml-[-0.15rem] has-[>[data-slot=input-group-text]]:mr-1 has-[>[data-slot=input-group-text]]:self-stretch has-[>[data-slot=input-group-text]]:rounded-l-md has-[>[data-slot=input-group-text]]:border-r has-[>[data-slot=input-group-text]]:bg-sidebar has-[>[data-slot=input-group-text]]:px-3",
				"inline-end":
					"order-last pr-2.5 has-[>button]:-mr-1.5 has-[>kbd]:mr-[-0.15rem] has-[>[data-slot=input-group-text]]:ml-1 has-[>[data-slot=input-group-text]]:self-stretch has-[>[data-slot=input-group-text]]:rounded-r-md has-[>[data-slot=input-group-text]]:border-l has-[>[data-slot=input-group-text]]:bg-sidebar has-[>[data-slot=input-group-text]]:px-3",
				"block-start":
					"order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2",
				"block-end":
					"order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2",
			},
		},
		defaultVariants: {
			align: "inline-start",
		},
	},
);

function InputGroupAddon({
	className,
	align = "inline-start",
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
	return (
		<div
			role="group"
			data-slot="input-group-addon"
			data-align={align}
			className={cn(inputGroupAddonVariants({ align }), className)}
			onClick={(e) => {
				if (align === "block-start" || align === "block-end") return;
				if ((e.target as HTMLElement).closest("button")) {
					return;
				}
				e.currentTarget.parentElement?.querySelector("input")?.focus();
			}}
			{...props}
		/>
	);
}

const inputGroupButtonVariants = cva(
	"flex items-center gap-2 text-sm shadow-none",
	{
		variants: {
			size: {
				xs: "h-6 gap-1 rounded-sm px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
				sm: "",
				"icon-xs": "size-6 rounded-sm p-0 has-[>svg]:p-0",
				"icon-sm": "size-8 rounded-sm p-0 has-[>svg]:p-0",
			},
		},
		defaultVariants: {
			size: "xs",
		},
	},
);

function InputGroupButton({
	className,
	type = "button",
	variant = "ghost",
	size = "xs",
	...props
}: Omit<React.ComponentProps<typeof Button>, "size"> &
	VariantProps<typeof inputGroupButtonVariants>) {
	return (
		<Button
			type={type}
			data-size={size}
			variant={variant}
			className={cn(inputGroupButtonVariants({ size }), className)}
			{...props}
		/>
	);
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="input-group-text"
			className={cn(
				"flex items-center gap-2 text-sm text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5",
				className,
			)}
			{...props}
		/>
	);
}

function InputGroupInput({
	className,
	...props
}: React.ComponentProps<"input">) {
	return (
		<Input
			data-slot="input-group-control"
			className={cn(
				"h-full min-h-0 flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 hover:border-transparent focus-visible:shadow-none focus-visible:ring-0 disabled:bg-transparent aria-invalid:border-0 aria-invalid:ring-0",
				className,
			)}
			{...props}
		/>
	);
}

function InputGroupTextarea({
	className,
	size = "sm",
	...props
}: React.ComponentProps<typeof Textarea>) {
	return (
		<Textarea
			data-slot="input-group-control"
			size={size}
			className={cn(
				"flex-1 resize-none rounded-none border-0 bg-transparent py-2 shadow-none ring-0 hover:border-transparent focus-visible:shadow-none focus-visible:ring-0 disabled:bg-transparent aria-invalid:border-0 aria-invalid:ring-0",
				className,
			)}
			{...props}
		/>
	);
}

export {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupText,
	InputGroupTextarea,
};
