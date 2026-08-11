"use client";

import ArrowLeft from "@carbon/icons-react/es/ArrowLeft";
import Close from "@carbon/icons-react/es/Close";
import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import type { CarbonIcon } from "@crm/ui/components/icon";
import { Icon } from "@crm/ui/components/icon";
import { Separator } from "@crm/ui/components/separator";
import type { SheetSize } from "@crm/ui/components/sheet";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { cn } from "@crm/ui/lib/utils";
import { type ReactNode, useRef, useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/responsive-sheet";

const GUTTER = "px-5";

export const SECTION_TITLE =
	"font-medium text-muted-foreground text-xs uppercase tracking-wider";

export const PROPERTY_ROW = "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2";

export const PROPERTY_LABEL = "truncate text-muted-foreground text-xs";

const PROPERTY_CELL = "border border-transparent py-1";

type DetailSheetFocusTarget = {
	isConnected: boolean;
	focus: () => void;
};

export function restoreDetailSheetFocus(
	target: DetailSheetFocusTarget | null,
	event?: Pick<Event, "preventDefault">,
): boolean {
	if (!target?.isConnected) return false;
	target.focus();
	event?.preventDefault();
	return true;
}

export function DetailSheet({
	open,
	onOpenChange,
	size = "2xl",
	className,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	size?: SheetSize;
	className?: string;
	children: ReactNode;
}) {
	const content = useRef<HTMLDivElement>(null);
	const opener = useRef<HTMLElement | null>(null);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				ref={content}
				side="right"
				size={size}
				showCloseButton={false}
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					const active = document.activeElement;
					opener.current =
						active instanceof HTMLElement &&
						active !== document.body &&
						!content.current?.contains(active)
							? active
							: null;
					content.current?.focus();
				}}
				onCloseAutoFocus={(event) => {
					restoreDetailSheetFocus(opener.current, event);
					opener.current = null;
				}}
				className={cn("flex flex-col gap-0 p-0", className)}
			>
				{children}
			</SheetContent>
		</Sheet>
	);
}

export function DetailSheetHeader({
	media,
	title,
	description,
	note,
	actions,
	onBack,
	onClose,
}: {
	media?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	note?: ReactNode;
	actions?: ReactNode;
	onBack?: () => void;
	onClose: () => void;
}) {
	return (
		<SheetHeader className={cn("gap-0 border-b py-3", GUTTER)}>
			<div className="flex items-start gap-3">
				{onBack ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon-sm" onClick={onBack}>
								<Icon icon={ArrowLeft} />
								<span className="sr-only">Back</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Back</TooltipContent>
					</Tooltip>
				) : null}

				{media}

				<div className="min-w-0 flex-1 space-y-0.5 pt-0.5">
					<SheetTitle size="lg" className="wrap-anywhere">
						{title}
					</SheetTitle>
					{description ? (
						<SheetDescription className="wrap-anywhere">
							{description}
						</SheetDescription>
					) : null}
					{note ? (
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs">
							{note}
						</div>
					) : null}
				</div>

				<div className="flex shrink-0 items-center gap-1">
					{actions}
					{actions ? (
						<Separator orientation="vertical" className="mx-1 h-5" />
					) : null}
					<Button variant="ghost" size="icon-sm" onClick={onClose}>
						<Icon icon={Close} />
						<span className="sr-only">Close</span>
					</Button>
				</div>
			</div>
		</SheetHeader>
	);
}

export function DetailSheetStats({ children }: { children: ReactNode }) {
	return (
		<dl className="flex shrink-0 divide-x border-b bg-muted/40">{children}</dl>
	);
}

export function DetailSheetStat({
	label,
	children,
}: {
	label: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className={cn("flex min-w-0 flex-1 flex-col gap-1 py-2.5", GUTTER)}>
			<dt className="truncate text-muted-foreground text-xs/5">{label}</dt>
			<dd className="min-w-0 truncate font-medium text-foreground text-sm/5">
				{children}
			</dd>
		</div>
	);
}

export type DetailSheetTab = {
	value: string;
	label: string;
	count?: number | null;
	content: ReactNode;
	keepMounted?: boolean;
};

export function DetailSheetTabs({
	tabs,
	value,
	onValueChange,
}: {
	tabs: DetailSheetTab[];
	value: string;
	onValueChange: (value: string) => void;
}) {
	const [opened] = useState(() => new Set<string>());
	opened.add(value);

	return (
		<Tabs
			value={value}
			onValueChange={onValueChange}
			className="flex min-h-0 flex-1 flex-col gap-0"
		>
			<TabsList
				variant="line"
				className={cn("w-full shrink-0 justify-start gap-6 border-b", GUTTER)}
			>
				{tabs.map((tab) => (
					<TabsTrigger key={tab.value} value={tab.value}>
						{tab.label}
						{tab.count ? (
							<span className="text-muted-foreground tabular-nums">
								{tab.count}
							</span>
						) : null}
					</TabsTrigger>
				))}
			</TabsList>

			{tabs.map((tab) => (
				<TabsContent
					key={tab.value}
					value={tab.value}
					forceMount={
						tab.keepMounted && opened.has(tab.value) ? true : undefined
					}
					className="flex min-h-0 flex-1 flex-col overflow-hidden outline-none data-[state=inactive]:hidden"
				>
					{tab.content}
				</TabsContent>
			))}
		</Tabs>
	);
}

export function DetailSheetBody({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			{children}
		</div>
	);
}

export function DetailSheetSection({
	title,
	action,
	className,
	children,
}: {
	title?: ReactNode;
	action?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<section
			className={cn(
				"space-y-2 border-b py-3 last:border-b-0",
				GUTTER,
				className,
			)}
		>
			{title || action ? (
				<div className="flex h-5 items-center justify-between gap-3">
					{title ? <h3 className={SECTION_TITLE}>{title}</h3> : <span />}
					{action}
				</div>
			) : null}
			{children}
		</section>
	);
}

export function DetailSheetSplit({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
			{children}
		</div>
	);
}

export function DetailSheetMain({ children }: { children: ReactNode }) {
	return <div className="flex min-w-0 flex-1 flex-col">{children}</div>;
}

export function DetailSheetRail({ children }: { children: ReactNode }) {
	return (
		<div className="flex w-full min-w-0 shrink-0 flex-col lg:w-80">
			{children}
		</div>
	);
}

export function DetailSheetProperties({
	children,
	columns = 2,
}: {
	children: ReactNode;
	columns?: 1 | 2;
}) {
	return (
		<div className={cn("grid gap-x-8", columns === 2 && "sm:grid-cols-2")}>
			{children}
		</div>
	);
}

export function DetailSheetPending({
	fields,
	running,
}: {
	fields: string[];
	running: boolean;
}) {
	if (fields.length === 0) return null;

	return (
		<div className="flex flex-col gap-1.5 rounded-md bg-muted/40 p-3">
			<div className="flex items-center gap-2">
				<span
					aria-hidden
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						running ? "bg-primary" : "bg-muted-foreground",
					)}
				/>
				<span className="font-medium text-xs">
					{running ? "Agent is researching" : "Not known yet"}
				</span>
			</div>
			<p className="text-pretty text-muted-foreground text-xs/5">
				{fields.join(", ")}
			</p>
		</div>
	);
}

export function DetailSheetProperty({
	label,
	wide = false,
	children,
}: {
	label: ReactNode;
	wide?: boolean;
	children: ReactNode;
}) {
	return (
		<div className={cn(PROPERTY_ROW, "items-start", wide && "sm:col-span-2")}>
			<span className={cn(PROPERTY_LABEL, PROPERTY_CELL, "text-xs/5")}>
				{label}
			</span>
			<div className={cn(PROPERTY_CELL, "min-w-0 px-2 text-xs/5")}>
				{children}
			</div>
		</div>
	);
}

export function DetailSheetProse({ children }: { children: ReactNode }) {
	return (
		<p className="text-pretty text-muted-foreground text-xs/5">{children}</p>
	);
}

export function DetailSheetEmpty({
	icon,
	title,
	description,
	action,
}: {
	icon: CarbonIcon;
	title: string;
	description: string;
	action?: ReactNode;
}) {
	return (
		<Empty className="flex-1">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Icon icon={icon} />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action ? <EmptyContent>{action}</EmptyContent> : null}
		</Empty>
	);
}
