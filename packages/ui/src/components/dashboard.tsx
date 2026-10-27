import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function StatGroup({
	className,
	children,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="stat-group"
			className={cn(
				"@container/stats overflow-hidden rounded-md bg-card text-card-foreground shadow-border",
				className,
			)}
			{...props}
		>
			<div className="grid grid-cols-1 divide-y @xl/stats:grid-cols-2 @xl/stats:divide-y-0 @xl/stats:[&>*:nth-child(even)]:border-l @xl/stats:[&>*:nth-child(n+3)]:border-t @4xl/stats:grid-cols-4 @4xl/stats:[&>*:nth-child(n+3)]:border-t-0 @4xl/stats:[&>*:not(:first-child)]:border-l">
				{children}
			</div>
		</div>
	);
}

function DashboardPanel({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dashboard-panel"
			className={cn(
				"flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md bg-card text-card-foreground text-sm shadow-border",
				className,
			)}
			{...props}
		/>
	);
}

const GRID_COLS = {
	2: "@md/dashboard:grid-cols-2",
	3: "@md/dashboard:grid-cols-2 @4xl/dashboard:grid-cols-3",
	4: "@md/dashboard:grid-cols-2 @4xl/dashboard:grid-cols-4",
} as const;

function DashboardGrid({
	className,
	columns = 4,
	...props
}: React.ComponentProps<"div"> & { columns?: keyof typeof GRID_COLS }) {
	return (
		<div className="@container/dashboard">
			<div
				data-slot="dashboard-grid"
				className={cn("grid grid-cols-1 gap-4", GRID_COLS[columns], className)}
				{...props}
			/>
		</div>
	);
}

function DashboardRow({
	className,
	split = "hero",
	...props
}: React.ComponentProps<"div"> & { split?: "hero" | "even" }) {
	return (
		<div className="@container/dashboard">
			<div
				data-slot="dashboard-row"
				className={cn(
					"grid grid-cols-1 gap-4",
					split === "hero"
						? "@3xl/dashboard:grid-cols-[2fr_1fr]"
						: "@3xl/dashboard:grid-cols-2",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function ChartCard({
	className,
	title,
	description,
	action,
	footer,
	children,
	...props
}: Omit<React.ComponentProps<"div">, "title"> & {
	title?: React.ReactNode;
	description?: React.ReactNode;
	action?: React.ReactNode;
	footer?: React.ReactNode;
}) {
	return (
		<div
			data-slot="chart-card"
			className={cn(
				"flex flex-col overflow-hidden rounded-md bg-card text-card-foreground shadow-border",
				className,
			)}
			{...props}
		>
			{title || description || action ? (
				<div className="flex items-start justify-between gap-4 p-5 md:p-6">
					<div className="flex min-w-0 flex-col gap-1">
						{title ? (
							<h3 className="truncate font-medium text-sm">{title}</h3>
						) : null}
						{description ? (
							<p className="text-muted-foreground text-xs/relaxed">
								{description}
							</p>
						) : null}
					</div>
					{action ? <div className="shrink-0">{action}</div> : null}
				</div>
			) : null}
			<div className="flex flex-1 flex-col justify-center pb-5 md:pb-6">
				{children}
			</div>
			{footer ? (
				<div className="border-t px-5 py-3 text-muted-foreground text-xs md:px-6">
					{footer}
				</div>
			) : null}
		</div>
	);
}

function KpiCard({
	className,
	title,
	children,
	...props
}: Omit<React.ComponentProps<"div">, "title"> & {
	title: React.ReactNode;
}) {
	return (
		<div
			data-slot="kpi-card"
			className={cn(
				"flex flex-col gap-4 rounded-md bg-card p-5 text-card-foreground shadow-border md:p-6",
				className,
			)}
			{...props}
		>
			<h3 className="truncate font-medium text-muted-foreground text-sm">
				{title}
			</h3>
			{children}
		</div>
	);
}

function DashboardSection({
	className,
	title,
	description,
	action,
	children,
	...props
}: Omit<React.ComponentProps<"section">, "title"> & {
	title?: React.ReactNode;
	description?: React.ReactNode;
	action?: React.ReactNode;
}) {
	const hasHeader = title || description || action;
	return (
		<section
			data-slot="dashboard-section"
			className={cn("flex flex-col gap-4", className)}
			{...props}
		>
			{hasHeader ? (
				<div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
					<div className="flex flex-col gap-1">
						{title ? (
							<h2 className="font-medium text-base tracking-tight">{title}</h2>
						) : null}
						{description ? (
							<p className="text-muted-foreground text-sm">{description}</p>
						) : null}
					</div>
					{action ? <div className="shrink-0">{action}</div> : null}
				</div>
			) : null}
			{children}
		</section>
	);
}

export {
	ChartCard,
	DashboardGrid,
	DashboardPanel,
	DashboardRow,
	DashboardSection,
	KpiCard,
	StatGroup,
};
