import { SkeletonField } from "@crm/ui/components/skeleton-lines";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

type SettingsCardProps = {
	title: React.ReactNode;
	description?: React.ReactNode;
	status?: React.ReactNode;
	hint?: React.ReactNode;
	action?: React.ReactNode;
	tone?: "default" | "destructive";
	control?: "compact" | "full" | "table";
	loading?: boolean;
	loadingFallback?: React.ReactNode;
	titleId?: string;
	descriptionId?: string;
	children?: React.ReactNode;
};

function SettingsCard({
	title,
	description,
	status,
	hint,
	action,
	tone = "default",
	control = "full",
	loading = false,
	loadingFallback,
	titleId,
	descriptionId,
	children,
}: SettingsCardProps) {
	const destructive = tone === "destructive";
	const table = control === "table";

	return (
		<section
			aria-labelledby={titleId}
			className={cn(
				"overflow-hidden rounded-md bg-card text-card-foreground",
				destructive ? "ring-1 ring-destructive/30" : "shadow-border",
			)}
			data-slot="settings-card"
		>
			<div className="flex flex-col gap-5 p-5">
				<div className="flex flex-col gap-2">
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
						<h2
							className="text-balance font-semibold text-xl tracking-tight"
							id={titleId}
						>
							{title}
						</h2>
						{status}
					</div>
					{description ? (
						<p
							className="text-pretty text-muted-foreground text-sm"
							id={descriptionId}
						>
							{description}
						</p>
					) : null}
				</div>
				{children && !table ? (
					<div
						aria-busy={loading || undefined}
						className={cn(control === "compact" && "max-w-xs")}
					>
						{loading ? (loadingFallback ?? <SkeletonField />) : children}
					</div>
				) : null}
			</div>
			{children && table ? (
				<div
					aria-busy={loading || undefined}
					className={cn(
						"border-t [&_[data-slot=table-container]]:rounded-none [&_[data-slot=table-container]]:border-0 [&_[data-slot=table-container]]:shadow-none",
						"[&_[data-slot=table-container]_:is(th,td):first-child]:pl-5 [&_[data-slot=table-container]_:is(th,td):last-child]:pr-5",
					)}
				>
					{loading ? (loadingFallback ?? <SkeletonField />) : children}
				</div>
			) : null}
			{hint || action ? (
				<div
					className={cn(
						"flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t py-3 pr-3 pl-5",
						destructive
							? "border-destructive/30 bg-destructive/5"
							: "bg-sidebar",
					)}
				>
					<div className="text-pretty text-muted-foreground text-sm [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-foreground">
						{hint}
					</div>
					{loading && action ? (
						<div className="pointer-events-none opacity-50" inert>
							{action}
						</div>
					) : (
						action
					)}
				</div>
			) : null}
		</section>
	);
}

function SettingsColumn({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-8" data-slot="settings-column">
			{children}
		</div>
	);
}

export { SettingsCard, SettingsColumn };
