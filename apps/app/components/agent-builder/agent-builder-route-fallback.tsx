import { Skeleton } from "@crm/ui/components/skeleton";

export function AgentBuilderHomeFallback() {
	return (
		<main
			className="flex min-h-0 flex-1 items-center justify-center px-4"
			aria-busy="true"
		>
			<div className="flex w-full max-w-2xl flex-col items-center gap-5">
				<div
					className="flex w-full flex-col items-center gap-2"
					aria-hidden="true"
				>
					<Skeleton className="h-6 w-52 max-w-full" />
					<Skeleton className="h-4 w-80 max-w-full" />
				</div>
				<Skeleton className="h-24 w-full rounded-lg" aria-hidden="true" />
			</div>
			<span role="status" className="sr-only">
				Opening chat…
			</span>
		</main>
	);
}

export function AgentBuilderChatFallback() {
	return (
		<main className="flex min-h-0 flex-1 flex-col" aria-busy="true">
			<header className="flex h-12 shrink-0 items-center px-4 sm:px-5">
				<Skeleton className="h-4 w-40 max-w-full" aria-hidden="true" />
			</header>
			<div className="min-h-0 flex-1 overflow-hidden">
				<div
					className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-5 sm:py-9"
					aria-hidden="true"
				>
					<Skeleton className="ms-auto h-16 w-2/3 max-w-[520px] rounded-lg" />
					<div className="flex max-w-[640px] flex-col gap-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-11/12" />
						<Skeleton className="h-4 w-8/12" />
					</div>
				</div>
			</div>
			<span role="status" className="sr-only">
				Opening chat…
			</span>
		</main>
	);
}
