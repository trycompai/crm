"use client";

import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import type * as React from "react";

function Accordion({
	className,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
	return (
		<AccordionPrimitive.Root
			data-slot="accordion"
			className={cn("flex w-full flex-col", className)}
			{...props}
		/>
	);
}

function AccordionItem({
	className,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
	return (
		<AccordionPrimitive.Item
			data-slot="accordion-item"
			className={cn("not-last:border-b", className)}
			{...props}
		/>
	);
}

const accordionTriggerVariants = cva(
	"group/accordion-trigger relative flex items-start rounded-md border border-transparent text-left outline-none transition-all focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:after:border-ring disabled:pointer-events-none disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:text-muted-foreground",
	{
		variants: {
			variant: {
				default:
					"flex-1 justify-between py-2.5 font-medium text-sm hover:underline **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4",
				plain:
					"flex-1 justify-between py-2.5 text-left **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4",
				subtle:
					"w-fit max-w-full items-center gap-1 py-1 text-muted-foreground text-xs hover:text-foreground **:data-[slot=accordion-trigger-icon]:size-3",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

function AccordionTrigger({
	className,
	variant,
	children,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> &
	VariantProps<typeof accordionTriggerVariants>) {
	return (
		<AccordionPrimitive.Header className="flex">
			<AccordionPrimitive.Trigger
				data-slot="accordion-trigger"
				className={cn(accordionTriggerVariants({ variant }), className)}
				{...props}
			>
				{children}
				<ChevronDownIcon
					data-slot="accordion-trigger-icon"
					className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
				/>
				<ChevronUpIcon
					data-slot="accordion-trigger-icon"
					className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
				/>
			</AccordionPrimitive.Trigger>
		</AccordionPrimitive.Header>
	);
}

function AccordionContent({
	className,
	children,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
	return (
		<AccordionPrimitive.Content
			data-slot="accordion-content"
			className="overflow-hidden text-xs data-closed:animate-accordion-up data-open:animate-accordion-down"
			{...props}
		>
			<div
				className={cn(
					"pt-0 pb-2.5 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
					className,
				)}
			>
				{children}
			</div>
		</AccordionPrimitive.Content>
	);
}

export {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	accordionTriggerVariants,
};
