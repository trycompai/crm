import { cn } from "@crm/ui/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn(
				"animate-pulse rounded-sm bg-muted motion-reduce:animate-none",
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
