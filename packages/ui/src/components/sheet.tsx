"use client";

import { Button } from "@crm/ui/components/button";
import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type * as React from "react";

const sheetContentVariants = cva(
	"sheet-motion fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-modal outline-none data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-full data-[side=right]:md:w-3/4 data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=right]:md:corner-cut data-[side=right]:md:shadow-none",
	{
		variants: {
			size: {
				sm: "data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
				md: "data-[side=left]:sm:max-w-[460px] data-[side=right]:sm:max-w-[460px]",
				lg: "data-[side=left]:sm:max-w-3xl data-[side=right]:sm:max-w-3xl",
				xl: "data-[side=left]:sm:max-w-4xl data-[side=right]:sm:max-w-4xl",
				"2xl":
					"data-[side=left]:sm:max-w-5xl data-[side=right]:sm:max-w-5xl data-[side=left]:lg:w-[68vw] data-[side=right]:lg:w-[68vw]",
				record:
					"data-[side=right]:md:w-[calc(100%-3.5rem)] data-[side=right]:lg:w-[max(75%,calc(100%-(--spacing(86))))] data-[side=right]:md:max-w-274",
			},
		},
		defaultVariants: {
			size: "sm",
		},
	},
);

export type SheetSize = NonNullable<
	VariantProps<typeof sheetContentVariants>["size"]
>;

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
	return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
	return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
	return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
	return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
	return (
		<SheetPrimitive.Overlay
			data-slot="sheet-overlay"
			className={cn(
				"sheet-overlay-motion fixed inset-0 z-50 bg-overlay",
				className,
			)}
			{...props}
		/>
	);
}

function SheetContent({
	className,
	children,
	side = "right",
	size,
	showCloseButton = true,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
	side?: "top" | "right" | "bottom" | "left";
	size?: SheetSize;
	showCloseButton?: boolean;
}) {
	return (
		<SheetPortal>
			<SheetOverlay />
			<SheetPrimitive.Content
				data-slot="sheet-content"
				data-side={side}
				className={cn(sheetContentVariants({ size }), className)}
				{...props}
			>
				{side === "right" ? (
					<svg
						aria-hidden
						data-slot="sheet-cut-edge"
						className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden h-full w-6 text-border md:block"
					>
						<path
							d="M26 0.5Q22.17 0.5 19.15 2.85L3.47 15.03Q0.5 17.34 0.5 21.1V100000"
							fill="none"
							stroke="currentColor"
							strokeLinejoin="round"
							strokeWidth={1}
						/>
					</svg>
				) : null}
				{children}
				{showCloseButton && (
					<SheetPrimitive.Close data-slot="sheet-close" asChild>
						<Button
							variant="ghost"
							className="absolute top-4.5 right-4"
							size="icon-sm"
						>
							<XIcon />
							<span className="sr-only">Close</span>
						</Button>
					</SheetPrimitive.Close>
				)}
			</SheetPrimitive.Content>
		</SheetPortal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-header"
			className={cn("flex flex-col gap-1 border-b px-6 py-5", className)}
			{...props}
		/>
	);
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-footer"
			className={cn("mt-auto flex flex-col gap-2 border-t bg-sidebar px-6 py-3", className)}
			{...props}
		/>
	);
}

const sheetTitleVariants = cva(
	"font-heading font-semibold tracking-tight text-balance text-foreground outline-none",
	{
		variants: {
			size: {
				default: "text-lg",
				lg: "text-lg leading-tight",
			},
		},
		defaultVariants: {
			size: "default",
		},
	},
);

function SheetTitle({
	className,
	size,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Title> &
	VariantProps<typeof sheetTitleVariants>) {
	return (
		<SheetPrimitive.Title
			data-slot="sheet-title"
			className={cn(sheetTitleVariants({ size }), className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
	return (
		<SheetPrimitive.Description
			data-slot="sheet-description"
			className={cn("text-sm text-pretty text-muted-foreground", className)}
			{...props}
		/>
	);
}

export {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
	sheetContentVariants,
};
