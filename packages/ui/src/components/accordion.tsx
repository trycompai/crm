"use client";

import { cn } from "@crm/ui/lib/utils";
import { UI_MOTION } from "@crm/ui/lib/motion";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import type * as React from "react";
import { forwardRef } from "react";

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

const accordionContentVariants = cva(
	"pt-0 pb-2.5 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
	{
		variants: {
			layout: {
				default: "",
				stack: "flex flex-col items-start gap-3",
			},
		},
		defaultVariants: { layout: "default" },
	},
);

function AccordionContent({
	className,
	children,
	layout,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Content> &
	VariantProps<typeof accordionContentVariants>) {
	return (
		<AccordionPrimitive.Content forceMount asChild {...props}>
			<MotionAccordionContent>
				<div
					className={cn(accordionContentVariants({ layout }), className)}
				>
					{children}
				</div>
			</MotionAccordionContent>
		</AccordionPrimitive.Content>
	);
}

type MotionAccordionContentProps = React.ComponentProps<typeof m.div> & {
	"data-state"?: "open" | "closed";
};

const MotionAccordionContent = forwardRef<
	HTMLDivElement,
	MotionAccordionContentProps
>(function MotionAccordionContent(
	{ "data-state": dataState, className, ...props },
	ref,
) {
	const reducedMotion = useReducedMotion();
	const open = dataState === "open";

	return (
		<LazyMotion features={domAnimation}>
			<m.div
				{...props}
				ref={ref}
				data-slot="accordion-content"
				data-state={dataState}
				initial={false}
				animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
				transition={reducedMotion ? UI_MOTION.instant : UI_MOTION.accordion}
				aria-hidden={!open}
				inert={open ? undefined : true}
				className={cn("overflow-hidden text-xs", className)}
			/>
		</LazyMotion>
	);
});

export {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	accordionTriggerVariants,
};
