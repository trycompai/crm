import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const textareaVariants = cva(
	"flex field-sizing-content w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs transition-colors outline-none placeholder:text-muted-foreground hover:border-ring/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25 md:text-xs dark:bg-muted dark:shadow-[inset_0_1px_1px_rgb(0_0_0/0.30)] dark:disabled:bg-muted",
	{
		variants: {
			variant: {
				default: "",
				composer:
					"resize-none rounded-none border-transparent bg-transparent px-1 py-0 text-base leading-6 shadow-none ring-0 hover:border-transparent focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent sm:text-[15px] dark:bg-transparent dark:shadow-none dark:disabled:bg-transparent",
			},
			size: {
				default: "min-h-16",
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
