import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] outline-none select-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground hover:bg-primary/80 disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
				outline:
					"border-border bg-background hover:border-input hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
				"outline-ghost":
					"border-border hover:border-input hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
				ghost:
					"hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
				destructive:
					"bg-destructive-solid text-destructive-foreground hover:bg-destructive-solid/90 disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
				contrast:
					"bg-foreground text-background hover:bg-foreground/80 disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default:
					"h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
				xs: "h-6 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				"sm-flush": "-ml-2 h-8 gap-1.5 px-2",
				"block-flush":
					"-mx-1 h-auto min-h-16 w-[calc(100%+--spacing(2))] items-start justify-start gap-1.5 whitespace-pre-wrap px-1 py-2 text-left font-normal leading-5 [--focus-outline-offset:-2px] focus-visible:border-ring focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]",
				lg: "h-10 gap-2 rounded-lg px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
				xl: "h-10 gap-2 px-5 text-15 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
				icon: "size-9",
				"icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-8",
				"icon-lg": "size-10 rounded-lg",
				inline: "h-auto w-fit p-0",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
