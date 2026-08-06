import { Skeleton } from "@crm/ui/components/skeleton";

export default function AgentBuilderRouteLoading() {
	return (
		<main className="flex min-h-0 flex-1 flex-col" aria-busy="true">
			<header className="flex h-12 shrink-0 items-center border-b px-4 sm:px-5">
				<Skeleton className="h-4 w-40 max-w-full" />
			</header>
			<div className="min-h-0 flex-1 overflow-hidden">
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-5 sm:py-9">
					<Skeleton className="ms-auto h-16 w-2/3 max-w-[520px]" />
					<div className="flex max-w-[640px] flex-col gap-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-11/12" />
						<Skeleton className="h-4 w-8/12" />
					</div>
				</div>
			</div>
			<span role="status" className="sr-only">
				Opening chat
			</span>
		</main>
	);
}
