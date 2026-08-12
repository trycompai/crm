import { Skeleton } from "@crm/ui/components/skeleton";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { PageTransition } from "./page-transition";

function PageShell({
	className,
	contained = false,
	...props
}: React.ComponentProps<"div"> & { contained?: boolean }) {
	return (
		<PageTransition>
			<main
				data-slot="page-shell-scroll"
				className={cn(
					"flex min-w-0 flex-1 flex-col px-4 pt-4 pb-4 md:px-6 md:pt-6 md:pb-6",
					contained ? "min-h-0 overflow-hidden" : "overflow-y-auto",
				)}
			>
				<div
					data-slot="page-shell"
					className={cn(
						"mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col gap-6",
						className,
					)}
					{...props}
				/>
			</main>
		</PageTransition>
	);
}

function PageShellHeader({
	className,
	children,
	...props
}: React.ComponentProps<"div">) {
	return (
		<header
			data-slot="page-shell-header"
			className={cn(
				"flex flex-col gap-3 [view-transition-name:page-header]",
				className,
			)}
			{...props}
		>
			<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2">
				{children}
			</div>
		</header>
	);
}

function PageShellHeading({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="page-shell-heading"
			className={cn("contents", className)}
			{...props}
		/>
	);
}

function PageShellTitle({ className, ...props }: React.ComponentProps<"h1">) {
	return (
		<h1
			data-slot="page-shell-title"
			className={cn(
				"col-start-1 row-start-1 min-w-0 self-center text-balance font-medium text-2xl tracking-tight md:text-3xl",
				className,
			)}
			{...props}
		/>
	);
}

function PageShellDescription({
	className,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="page-shell-description"
			className={cn(
				"col-span-full row-start-2 text-balance text-muted-foreground text-sm",
				className,
			)}
			{...props}
		/>
	);
}

function PageShellActions({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="page-shell-actions"
			className={cn(
				"col-start-2 row-start-1 flex flex-wrap items-center gap-2 self-center justify-self-end",
				className,
			)}
			{...props}
		/>
	);
}

function PageShellContent({
	className,
	children,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="page-shell-content"
			className={cn(
				"@container/page-content flex flex-1 flex-col gap-6",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

function PageShellLoading() {
	return (
		<div aria-busy="true" className="flex justify-center py-12">
			<Spinner size="lg" />
		</div>
	);
}

function PageShellFallback() {
	return (
		<PageShell aria-busy="true">
			<div className="flex flex-col gap-6" aria-hidden="true">
				<div className="flex flex-col gap-3">
					<Skeleton className="h-8 w-48 max-w-full" />
					<Skeleton className="h-4 w-72 max-w-full" />
				</div>
				<div className="flex flex-col gap-3">
					<Skeleton className="h-14 w-full rounded-lg" />
					<Skeleton className="h-14 w-full rounded-lg" />
					<Skeleton className="h-40 w-full rounded-lg" />
				</div>
			</div>
			<span role="status" className="sr-only">
				Loading page…
			</span>
		</PageShell>
	);
}

export {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellFallback,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
};
