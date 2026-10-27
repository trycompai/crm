"use client";

import { Button } from "@crm/ui/components/button";
import { Skeleton } from "@crm/ui/components/skeleton";
import { SkeletonBlock, SkeletonLine } from "@crm/ui/components/skeleton-lines";
import { SheetTitle } from "@crm/ui/components/sheet";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { SKELETON, skeletonRows } from "@crm/ui/lib/skeleton-config";
import { cn } from "@crm/ui/lib/utils";
import {
	ArrowLeftIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	XIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

export const RECORD_TITLE_SELECTOR = "[data-slot='record-title']";

export function focusRecordTitle(container: HTMLElement | null) {
	const title = container?.querySelector<HTMLElement>(RECORD_TITLE_SELECTOR);
	(title ?? container)?.focus();
}

function claimFocus(title: HTMLHeadingElement | null) {
	if (!title) return;
	const popup = title.closest<HTMLElement>("[data-slot='sheet-content']");
	const focused = document.activeElement;
	if (popup && (focused === popup || focused === document.body)) {
		title.focus();
	}
}

export type RecordSheetNavigation = {
	index: number;
	total: number;
	onPrevious: () => void;
	onNext: () => void;
};

function RecordQueue({
	label,
	navigation,
}: {
	label: string;
	navigation: RecordSheetNavigation;
}) {
	const { index, total, onPrevious, onNext } = navigation;
	const inQueue = index >= 0 && index < total;

	return (
		<div data-slot="record-queue" className="flex shrink-0 items-center gap-0.5">
			<Button
				aria-label={`Previous ${label.toLowerCase()}`}
				disabled={!inQueue || index === 0}
				onClick={onPrevious}
				size="icon-xs"
				variant="secondary"
			>
				<ChevronUpIcon />
			</Button>
			<Button
				aria-label={`Next ${label.toLowerCase()}`}
				disabled={!inQueue || index >= total - 1}
				onClick={onNext}
				size="icon-xs"
				variant="secondary"
			>
				<ChevronDownIcon />
			</Button>
			<output className="pl-2 text-muted-foreground text-sm tabular-nums">
				{inQueue ? `${label} ${index + 1} of ${total}` : label}
			</output>
		</div>
	);
}

export function RecordSheetBar({
	label,
	back,
	navigation,
	onClose,
}: {
	label: string;
	back?: { label: string; onBack: () => void };
	navigation?: RecordSheetNavigation;
	onClose: () => void;
}) {
	return (
		<div
			data-slot="record-sheet-bar"
			className="flex h-13 shrink-0 items-center justify-between gap-3 border-b px-4 md:pl-6"
		>
			<div className="flex min-w-0 items-center gap-2">
				{back ? (
					<Button
						variant="ghost"
						size="sm"
						className="-ml-2 min-w-0"
						onClick={back.onBack}
					>
						<ArrowLeftIcon data-icon="inline-start" />
						<span className="truncate">{back.label}</span>
					</Button>
				) : null}
				{navigation && navigation.total > 0 ? (
					<RecordQueue label={label} navigation={navigation} />
				) : (
					<span
						className={cn(
							"shrink-0 text-muted-foreground text-sm",
							!back && "pl-1",
						)}
					>
						{label}
					</span>
				)}
			</div>
			<Button variant="ghost" size="icon-sm" onClick={onClose}>
				<XIcon />
				<span className="sr-only">Close</span>
			</Button>
		</div>
	);
}

export function RecordSheetHeader({
	title,
	loading = false,
	media,
	pills,
	actions,
}: {
	title: string;
	loading?: boolean;
	media?: ReactNode;
	pills?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<header
			data-slot="record-sheet-header"
			aria-busy={loading || undefined}
			className="shrink-0 border-b px-4 py-3 md:px-6"
		>
			<div className="flex min-h-8 items-start justify-between gap-3">
				<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
					<div className="flex min-w-0 items-start gap-2.5">
						{media && !loading ? (
							<span className="flex h-7 shrink-0 items-center">{media}</span>
						) : null}
						<SheetTitle
							ref={claimFocus}
							data-slot="record-title"
							tabIndex={-1}
							className={cn(
								"min-w-0 wrap-anywhere leading-7",
								loading && "sr-only",
							)}
						>
							{loading ? `Loading ${title.toLowerCase()}` : title}
						</SheetTitle>
						{loading ? (
							<Skeleton aria-hidden className="my-1 h-5 w-64 max-w-full" />
						) : null}
					</div>
					{pills && !loading ? (
						<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-sm">
							{pills}
						</div>
					) : null}
				</div>
				{actions && !loading ? (
					<div className="flex shrink-0 items-center gap-1">{actions}</div>
				) : null}
			</div>
		</header>
	);
}

export type RecordSheetTab = {
	value: string;
	label: string;
	count?: number | null;
	content: ReactNode;
	fills?: boolean;
	keepMounted?: boolean;
};

export function RecordSheetBody({
	tabs,
	value,
	onValueChange,
	rail,
}: {
	tabs: RecordSheetTab[];
	value: string;
	onValueChange: (value: string) => void;
	rail?: ReactNode;
}) {
	const [opened] = useState(() => new Set<string>());
	opened.add(value);

	const active = tabs.find((tab) => tab.value === value) ?? tabs[0];
	const fills = active?.fills ?? false;
	const first = active?.value === tabs[0]?.value;

	return (
		<div
			data-slot="record-sheet-body"
			data-fills={fills || undefined}
			className={cn(
				"flex min-h-0 flex-1 flex-col items-stretch gap-6 overflow-x-hidden px-4 md:flex-row md:overflow-hidden md:px-6 md:pt-5",
				fills ? "max-md:overflow-hidden" : "overflow-y-auto pb-6 md:pb-0",
			)}
		>
			<Tabs
				value={active?.value ?? value}
				onValueChange={onValueChange}
				className={cn(
					"flex w-full min-w-0 flex-col gap-4.5 pt-4 md:min-h-0 md:flex-1 md:self-stretch md:pt-0",
					fills && "min-h-0 flex-1",
				)}
			>
				{tabs.length > 1 ? (
					<div className="no-scrollbar w-full min-w-0 shrink-0 overflow-x-auto">
						<TabsList variant="line" className="max-md:gap-3">
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
					</div>
				) : null}

				{tabs.map((tab) => (
					<TabsContent
						key={tab.value}
						value={tab.value}
						forceMount={
							tab.keepMounted && opened.has(tab.value) ? true : undefined
						}
						className={cn(
							"min-w-0 data-[state=inactive]:hidden",
							tab.fills
								? "flex min-h-0 flex-1 flex-col overflow-hidden pb-4 md:pb-6"
								: "scroll-gutter flex flex-col gap-4.5 *:shrink-0 md:min-h-0 md:flex-1 md:overflow-y-auto md:overflow-x-hidden md:pt-1 md:pb-6",
						)}
					>
						{tab.content}
					</TabsContent>
				))}
			</Tabs>

			{rail ? (
				<RecordRail className={cn(!first && "max-md:hidden")}>{rail}</RecordRail>
			) : null}
		</div>
	);
}

export function RecordSectionSkeleton() {
	return (
		<div className="flex min-w-0 flex-col gap-2.5">
			<div className="flex min-h-7 items-center">
				<SkeletonLine width="24" />
			</div>
			<SkeletonBlock height="40" />
		</div>
	);
}

export function RecordRailSkeleton() {
	return (
		<div className="flex min-w-0 flex-col gap-2.5">
			<div className="flex min-h-7 items-center">
				<SkeletonLine width="24" />
			</div>
			<div className="flex min-w-0 flex-col">
				{skeletonRows(SKELETON.rows.rail).map((row) => (
					<div
						className="flex min-w-0 items-center justify-between gap-3 py-1.5"
						key={row}
					>
						<SkeletonLine width="24" />
						<Skeleton className="h-8 w-40 min-w-0" />
					</div>
				))}
			</div>
		</div>
	);
}

export function RecordSheetLoading({ tabs }: { tabs: number }) {
	const triggers = skeletonRows(tabs);

	return (
		<div
			aria-busy
			data-slot="record-sheet-body"
			className="flex min-h-0 flex-1 flex-col items-stretch gap-6 overflow-hidden px-4 md:flex-row md:px-6 md:pt-5"
		>
			<div className="flex w-full min-w-0 flex-col gap-4.5 pt-4 md:flex-1 md:pt-0">
				{tabs > 1 ? (
					<Tabs
						aria-hidden
						inert
						value={triggers[0]}
						className="w-full min-w-0 shrink-0 overflow-hidden"
					>
						<TabsList variant="line" className="max-md:gap-3">
							{triggers.map((trigger) => (
								<TabsTrigger key={trigger} value={trigger}>
									<Skeleton className="h-4 w-14" />
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				) : null}
				<RecordSectionSkeleton />
				<RecordSectionSkeleton />
			</div>
			<RecordRail>
				<RecordRailSkeleton />
			</RecordRail>
		</div>
	);
}

export function RecordRail({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			data-slot="record-rail"
			className={cn(
				"scroll-gutter flex w-full min-w-0 max-w-full flex-col gap-4.5 *:shrink-0 max-md:border-t max-md:pt-4.5 md:h-full md:w-83 md:shrink-0 md:self-stretch md:overflow-y-auto md:overflow-x-hidden md:pb-6",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function RecordSection({
	label,
	count,
	action,
	className,
	children,
}: {
	label?: ReactNode;
	count?: number;
	action?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<section
			data-slot="record-section"
			className={cn(
				"flex min-w-0 flex-col gap-2.5 border-t pt-4.5 first:border-t-0 first:pt-0",
				className,
			)}
		>
			{label || action ? (
				<div className="flex min-h-7 min-w-0 items-center justify-between gap-4">
					<h3 className="flex min-w-0 items-center gap-2 text-sm">
						<span className="truncate font-medium text-muted-foreground">
							{label}
						</span>
						{count === undefined ? null : (
							<span className="text-muted-foreground tabular-nums">
								{count}
							</span>
						)}
					</h3>
					{action}
				</div>
			) : null}
			{children}
		</section>
	);
}

export function RecordFigure({
	value,
	children,
}: {
	value: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
			<span className="font-semibold text-[2rem] text-foreground leading-9 tracking-[-0.04em] tabular-nums">
				{value}
			</span>
			{children ? (
				<span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-muted-foreground text-sm">
					{children}
				</span>
			) : null}
		</div>
	);
}

export function RecordFact({
	label,
	children,
}: {
	label: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-9 min-w-0 items-center justify-between gap-3 py-1.5 text-sm">
			<span className="shrink-0 truncate text-muted-foreground">{label}</span>
			<span className="flex min-w-0 justify-end text-right text-foreground">
				{children}
			</span>
		</div>
	);
}

export function RecordEmpty({ children }: { children: ReactNode }) {
	return <p className="text-pretty text-muted-foreground text-sm">{children}</p>;
}
