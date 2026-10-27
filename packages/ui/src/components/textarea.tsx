import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const textareaVariants = cva(
	"flex field-sizing-content w-full rounded-md border border-border bg-transparent px-2.5 py-2 text-base transition-[color,background-color,border-color,box-shadow] outline-none placeholder:text-muted-foreground supports-[field-sizing:content]:resize-none hover:border-input focus-visible:shadow-focus disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15 md:text-sm",
	{
		variants: {
			variant: {
				default: "",
				flush:
					"-mx-1 w-[calc(100%+--spacing(2))] px-1 [--focus-outline-offset:-2px] focus-visible:border-ring focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]",
				composer:
					"resize-none rounded-none border-transparent bg-transparent px-1 py-0 text-base leading-6 shadow-none ring-0 hover:border-transparent focus-visible:border-transparent focus-visible:shadow-none focus-visible:ring-0 disabled:bg-transparent sm:text-15",
			},
			size: {
				default: "min-h-24",
				sm: "min-h-8",
				composer: "max-h-40 min-h-6",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

function Textarea({
	className,
	variant,
	size,
	...props
}: Omit<React.ComponentProps<"textarea">, "size"> &
	VariantProps<typeof textareaVariants>) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(textareaVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

export { Textarea, textareaVariants };
