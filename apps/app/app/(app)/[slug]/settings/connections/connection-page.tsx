import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";

export function ConnectionPage({
	centered = false,
	className,
	children,
}: {
	centered?: boolean;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-(--spacing-page-inline) pt-(--spacing-page-top) pb-(--spacing-page-bottom)">
			<div
				className={cn(
					"mx-auto flex w-full max-w-(--container-page) flex-col gap-(--spacing-page-gap)",
					centered && "flex-1 justify-center",
					className,
				)}
			>
				{children}
			</div>
		</main>
	);
}

export function ConnectionPageLoading() {
	return (
		<main className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
			<Spinner size="lg" />
		</main>
	);
}
