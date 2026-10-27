import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function OptionLabel({
	label,
	detail,
	className,
}: {
	label: React.ReactNode;
	detail?: React.ReactNode;
	className?: string;
}) {
	return (
		<span
			data-slot="option-label"
			className={cn("flex min-w-0 items-baseline gap-2", className)}
		>
			<span className="shrink-0">{label}</span>
			{detail ? (
				<span className="min-w-0 truncate text-muted-foreground">{detail}</span>
			) : null}
		</span>
	);
}

export { OptionLabel };
