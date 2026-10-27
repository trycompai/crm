"use client";

import { useAppShellNav } from "@crm/ui/components/app-shell";
import { GeneratedAvatar } from "@crm/ui/components/generated-avatar";
import { Skeleton } from "@crm/ui/components/skeleton";
import { cn } from "@crm/ui/lib/utils";
import { ChevronLeftIcon, type LucideIcon } from "lucide-react";
import { Slot } from "radix-ui";
import type * as React from "react";

function AppSidebar({
	label,
	header,
	footer,
	children,
}: {
	label: string;
	header?: React.ReactNode;
	footer?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div data-slot="app-sidebar" className="flex min-h-0 flex-1 flex-col">
			{header ? <div className="shrink-0 px-2 pt-1">{header}</div> : null}
			<nav aria-label={label} className="flex min-h-0 flex-1 flex-col">
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
					{children}
				</div>
				{footer ? (
					<div className="shrink-0 p-2">
						<ul className="flex flex-col gap-0.5">{footer}</ul>
					</div>
				) : null}
			</nav>
		</div>
	);
}

function AppSidebarWorkspace({
	name,
	loading = false,
}: {
	name?: string;
	loading?: boolean;
}) {
	return (
		<div
			data-slot="app-sidebar-workspace"
			className="flex h-10 min-w-0 items-center gap-2 px-2"
		>
			{loading || !name ? (
				<>
					<Skeleton className="size-5 rounded-sm" />
					<Skeleton className="h-3.5 w-24" />
				</>
			) : (
				<>
					<GeneratedAvatar kind="workspace" seed={name} size="sm" />
					<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
						{name}
					</span>
				</>
			)}
		</div>
	);
}

function AppSidebarGroup({
	label,
	stacked = false,
	children,
}: {
	label?: string;
	stacked?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div
			data-slot="app-sidebar-group"
			className={cn("flex flex-col p-2", stacked && "py-0")}
		>
			{label ? (
				<div className="flex h-8 shrink-0 items-center px-2.5 font-medium text-muted-foreground text-xs">
					{label}
				</div>
			) : null}
			<ul className="flex flex-col gap-0.5">{children}</ul>
		</div>
	);
}

const itemClassName =
	"flex h-9 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2.5 text-left text-muted-foreground text-sm outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent aria-[current=page]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0";

const actionClassName =
	"absolute inset-y-0 right-1 flex items-center opacity-100 motion-safe:transition-opacity [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/item:pointer-events-auto [@media(hover:hover)]:group-focus-within/item:opacity-100 [@media(hover:hover)]:group-hover/item:pointer-events-auto [@media(hover:hover)]:group-hover/item:opacity-100";

function AppSidebarItem({
	icon: Glyph,
	label,
	active = false,
	inset = false,
	indicator,
	action,
	onClick,
	children,
}: {
	icon?: LucideIcon;
	label: string;
	active?: boolean;
	inset?: boolean;
	indicator?: React.ReactNode;
	action?: React.ReactNode;
	onClick?: React.MouseEventHandler<HTMLElement>;
	children: React.ReactElement;
}) {
	const nav = useAppShellNav();

	return (
		<li
			data-slot="app-sidebar-item"
			data-active={active || undefined}
			className="group/item relative before:absolute before:inset-y-1.5 before:-left-2 before:w-0.5 before:rounded-r-full before:bg-brand before:opacity-0 before:transition-opacity data-active:before:opacity-100 in-data-[slot=sheet-content]:before:-left-1 in-data-[slot=sheet-content]:before:rounded-full"
		>
			<Slot.Root
				aria-current={active ? "page" : undefined}
				className={cn(
					itemClassName,
					inset && "pl-8.5",
					action ? "pr-9" : null,
				)}
				onClick={(event: React.MouseEvent<HTMLElement>) => {
					onClick?.(event);
					nav.close();
				}}
			>
				{Glyph && !inset ? <Glyph aria-hidden /> : null}
				<span className="min-w-0 flex-1 truncate">{label}</span>
				{indicator ? (
					<span className="flex shrink-0 items-center text-muted-foreground [&_svg]:size-3.5">
						{indicator}
					</span>
				) : null}
				<Slot.Slottable>{children}</Slot.Slottable>
			</Slot.Root>
			{action ? (
				<div data-slot="app-sidebar-item-action" className={actionClassName}>
					{action}
				</div>
			) : null}
		</li>
	);
}

function AppSidebarSection({
	label,
	back,
	children,
}: {
	label: string;
	back: React.ReactElement;
	children: React.ReactNode;
}) {
	const nav = useAppShellNav();

	return (
		<>
			<div className="flex flex-col p-2 pb-0">
				<Slot.Root
					data-slot="app-sidebar-back"
					className="group/back flex h-9 w-full items-center gap-1 rounded-md pr-2.5 pl-1 font-semibold text-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={() => nav.close()}
				>
					<ChevronLeftIcon
						aria-hidden
						className="size-4 text-muted-foreground transition-transform group-hover/back:-translate-x-0.5 group-hover/back:text-foreground"
					/>
					<span className="min-w-0 truncate">{label}</span>
					<Slot.Slottable>{back}</Slot.Slottable>
				</Slot.Root>
			</div>
			{children}
		</>
	);
}

function AppSidebarSkeleton({ rows = 6 }: { rows?: number }) {
	return (
		<div aria-hidden className="flex flex-col gap-0.5 p-2">
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} className="flex h-9 items-center gap-2 px-2.5">
					<Skeleton className="size-4 rounded-sm" />
					<Skeleton className="h-3.5 w-24" />
				</div>
			))}
		</div>
	);
}

export {
	AppSidebar,
	AppSidebarGroup,
	AppSidebarItem,
	AppSidebarSection,
	AppSidebarSkeleton,
	AppSidebarWorkspace,
};
