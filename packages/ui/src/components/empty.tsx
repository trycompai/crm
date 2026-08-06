import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const emptyVariants = cva(
	"group/empty flex w-full min-w-0 flex-col items-center justify-center gap-4 rounded-lg border-dashed px-6 py-12 text-center text-balance",
	{
		variants: {
			width: {
				default: "",
				wide: "",
			},
		},
		defaultVariants: {
			width: "default",
		},
	},
);

function Empty({
	className,
	width = "default",
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyVariants>) {
	return (
		<div
			data-slot="empty"
			data-width={width}
			className={cn(emptyVariants({ width, className }))}
			{...props}
		/>
	);
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="empty-header"
			className={cn(
				"flex max-w-sm flex-col items-center gap-2",
				"group-data-[width=wide]/empty:max-w-xl",
				className,
			)}
			{...props}
		/>
	);
}

const emptyMediaVariants = cva(
	"mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-transparent",
				icon: "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground [&_svg:not([class*='size-'])]:size-4",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function EmptyMedia({
	className,
	variant = "default",
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
	return (
		<div
			data-slot="empty-icon"
			data-variant={variant}
			className={cn(emptyMediaVariants({ variant, className }))}
			{...props}
		/>
	);
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="empty-title"
			className={cn("font-heading text-sm font-medium", className)}
			{...props}
		/>
	);
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<div
			data-slot="empty-description"
			className={cn(
				"text-balance text-xs/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
				className,
			)}
			{...props}
		/>
	);
}

const emptyContentVariants = cva(
	"flex w-full max-w-sm min-w-0 items-center gap-2.5 text-xs text-balance group-data-[width=wide]/empty:max-w-2xl",
	{
		variants: {
			layout: {
				stack: "flex-col",
				row: "flex-row flex-wrap justify-center",
			},
		},
		defaultVariants: {
			layout: "stack",
		},
	},
);

function EmptyContent({
	className,
	layout,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyContentVariants>) {
	return (
		<div
			data-slot="empty-content"
			className={cn(emptyContentVariants({ layout, className }))}
			{...props}
		/>
	);
}

export {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
};
