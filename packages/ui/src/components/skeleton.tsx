import { cn } from "@crm/ui/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn(
				"animate-[tw-shimmer_2s_linear_infinite] rounded-md bg-muted bg-[linear-gradient(90deg,transparent_40%,color-mix(in_oklab,var(--foreground)_5%,transparent)_50%,transparent_60%)] bg-size-[300%_100%] bg-no-repeat motion-reduce:animate-none",
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
