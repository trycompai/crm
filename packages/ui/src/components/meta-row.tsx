import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function MetaRow({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="meta-row"
			className={cn(
				"flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-13 text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export { MetaRow };
