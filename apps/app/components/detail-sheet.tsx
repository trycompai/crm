"use client";

import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import type { IconComponent } from "@crm/ui/components/icon";
import { Icon } from "@crm/ui/components/icon";
import { RecordSection } from "@crm/ui/components/record-sheet";
import { Separator } from "@crm/ui/components/separator";
import type { SheetSize } from "@crm/ui/components/sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { cn } from "@crm/ui/lib/utils";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { type ReactNode, useRef } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/responsive-sheet";
import { type RecentRecord, rememberRecentRecord } from "@/lib/recent-records";
import { useWorkspaceSlug } from "@/lib/use-workspace-url";

const GUTTER = "px-5";

export const SECTION_TITLE =
	"font-medium text-muted-foreground text-xs uppercase tracking-wider";

export const PROPERTY_ROW = "grid min-h-9 grid-cols-[7rem_minmax(0,1fr)] gap-3";

export const PROPERTY_LABEL = "truncate text-muted-foreground text-sm";

const PROPERTY_CELL = "border border-transparent py-1.5";

function RememberLoadedRecord({ record }: { record: RecentRecord }) {
	const slug = useWorkspaceSlug();
	useMountEffect(() => rememberRecentRecord(slug, record));
	return null;
}

export function DetailSheetLoaded({
	record,
	children,
}: {
	record: RecentRecord | null;
	children: ReactNode;
}) {
	return (
		<>
			{record ? (
				<RememberLoadedRecord
					key={`${record.kind}:${record.id}`}
					record={record}
				/>
			) : null}
			{children}
		</>
	);
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

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				ref={content}
				side="right"
				size={size}
				showCloseButton={false}
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					content.current?.focus();
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
								<Icon icon={ArrowLeftIcon} />
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
						<Icon icon={XIcon} />
						<span className="sr-only">Close</span>
					</Button>
				</div>
			</div>
		</SheetHeader>
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
		<RecordSection label={title} action={action} className={className}>
			{children}
		</RecordSection>
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
		<div className={cn("grid gap-x-6", columns === 2 && "sm:grid-cols-2")}>
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
				<span className="font-medium text-13">
					{running ? "Agent is researching" : "Not known yet"}
				</span>
			</div>
			<p className="text-pretty text-13 text-muted-foreground">
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
			<span className={cn(PROPERTY_LABEL, PROPERTY_CELL, "text-sm/5")}>
				{label}
			</span>
			<div className={cn(PROPERTY_CELL, "min-w-0 px-2 text-sm/5")}>
				{children}
			</div>
		</div>
	);
}

export function DetailSheetProse({ children }: { children: ReactNode }) {
	return <p className="text-pretty text-foreground text-sm/6">{children}</p>;
}

export function DetailSheetEmpty({
	icon,
	title,
	description,
	action,
}: {
	icon: IconComponent;
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
