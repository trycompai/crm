import { StatGroup } from "@crm/ui/components/dashboard";
import {
	SkeletonBlock,
	SkeletonControl,
	SkeletonLine,
} from "@crm/ui/components/skeleton-lines";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { ViewTransition } from "react";
import type {} from "react/canary";

const transition = {
	"nav-forward": "nav-forward",
	"nav-back": "nav-back",
	"nav-lateral": "nav-lateral",
	default: "none",
} as const;

type PageWidth = "full" | "narrow";

function PageTransition({ children }: { children: React.ReactNode }) {
	return (
		<ViewTransition
			enter={transition}
			exit={transition}
			update={transition}
			default="none"
		>
			{children}
		</ViewTransition>
	);
}

function PageShell({
	className,
	contained = false,
	width = "full",
	...props
}: React.ComponentProps<"div"> & { contained?: boolean; width?: PageWidth }) {
	return (
		<PageTransition>
			<main
				data-slot="page-shell-scroll"
				className={cn(
					"relative flex min-w-0 flex-1 flex-col px-4 pt-5 pb-6 md:px-8 md:pt-8 md:pb-10",
					contained ? "min-h-0 overflow-hidden" : "overflow-y-auto",
				)}
			>
				<div
					data-slot="page-shell"
					data-width={width}
					className={cn(
						"flex w-full min-w-0 flex-1 flex-col gap-6",
						width === "narrow" && "mx-auto max-w-3xl",
						contained && "min-h-0",
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
			<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:gap-x-4">
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
				"col-start-1 row-start-1 min-w-0 self-center text-balance font-semibold text-2xl tracking-tight",
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
				"col-span-full row-start-2 max-w-prose text-pretty text-muted-foreground text-sm",
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
				"col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2 self-center max-sm:[&_:is([data-slot=button],[data-slot$=-trigger])[data-size]:not([data-size^=icon])]:h-8 max-sm:[&_:is([data-slot=button],[data-slot$=-trigger])[data-size]:not([data-size^=icon])]:px-3",
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

const TABLE_CONTROL_WIDTHS = ["32", "24", "20", "28"] as const;

const TABLE_SKELETON_ROWS = 5;

const STAT_SKELETON_TILES = 4;

function TableSkeleton({ controls }: { controls: number }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
				<div className="w-full sm:w-64">
					<SkeletonControl width="full" />
				</div>
				<div className="hidden flex-wrap items-center gap-2 sm:flex">
					{TABLE_CONTROL_WIDTHS.slice(
						TABLE_CONTROL_WIDTHS.length - controls,
					).map((width) => (
						<SkeletonControl key={width} width={width} />
					))}
				</div>
			</div>
			<div className="flex flex-col rounded-md bg-card shadow-border">
				<div className="flex h-10 items-center px-4 shadow-divider">
					<SkeletonLine width="24" />
				</div>
				{Array.from({ length: TABLE_SKELETON_ROWS }, (_, index) => (
					<div
						key={index}
						className="flex items-center gap-6 px-4 py-4 not-last:shadow-divider"
					>
						<div className="flex-1">
							<SkeletonLine width="72" />
						</div>
						<div className="hidden w-64 gap-6 md:flex">
							<SkeletonLine width="24" />
							<SkeletonLine width="24" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function DashboardSkeleton() {
	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				{Array.from({ length: STAT_SKELETON_TILES }, (_, index) => (
					<div key={index} className="flex flex-col gap-2 p-4 md:p-6">
						<SkeletonLine width="24" />
						<SkeletonLine size="2xl" width="24" />
						<SkeletonLine width="40" />
					</div>
				))}
			</StatGroup>
			<div className="@container/dashboard">
				<div className="grid grid-cols-1 gap-4 @3xl/dashboard:grid-cols-[2fr_1fr]">
					<div className="flex flex-col gap-3">
						<SkeletonLine width="48" />
						<SkeletonBlock height="56" />
					</div>
					<div className="flex flex-col gap-3">
						<SkeletonLine width="40" />
						<SkeletonBlock height="56" />
					</div>
				</div>
			</div>
		</div>
	);
}

function SettingsSkeleton() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-3">
				<SkeletonLine width="40" />
				<SkeletonBlock height="40" />
			</div>
			<div className="flex flex-col gap-3">
				<SkeletonLine width="24" />
				<SkeletonBlock height="24" />
			</div>
		</div>
	);
}

type LoadingShape = "block" | "table" | "dashboard" | "settings";

function PageShellLoading({ shape = "block" }: { shape?: LoadingShape }) {
	return (
		<div aria-busy="true" className="flex min-h-0 flex-1 flex-col">
			<div aria-hidden="true" className="flex min-h-0 flex-1 flex-col">
				{shape === "table" ? (
					<TableSkeleton controls={3} />
				) : shape === "dashboard" ? (
					<DashboardSkeleton />
				) : shape === "settings" ? (
					<SettingsSkeleton />
				) : (
					<SkeletonBlock height="56" />
				)}
			</div>
			<span role="status" className="sr-only">
				Loading page…
			</span>
		</div>
	);
}

function PageShellFallback({
	width = "full",
	shape = "block",
}: {
	width?: PageWidth;
	shape?: LoadingShape;
}) {
	return (
		<PageShell aria-busy="true" width={width}>
			<PageShellHeader aria-hidden="true">
				<PageShellHeading>
					<div className="col-start-1 row-start-1">
						<SkeletonLine size="2xl" width="48" />
					</div>
					<div className="col-span-full row-start-2 flex h-5 items-center">
						<SkeletonLine width="96" />
					</div>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<PageShellLoading shape={shape} />
			</PageShellContent>
		</PageShell>
	);
}

export type { PageWidth };
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
