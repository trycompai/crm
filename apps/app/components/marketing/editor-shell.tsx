"use client";

import ArrowLeft from "@carbon/icons-react/es/ArrowLeft";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import Link from "next/link";
import type { ReactNode } from "react";

export function MarketingEditorMeta({
	parts,
}: {
	parts: (string | null | false | undefined)[];
}) {
	const shown = parts.filter((part): part is string => Boolean(part));

	return (
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
			{shown.map((part, index) => (
				<span key={part} className="flex items-center gap-x-2">
					{index > 0 ? (
						<span className="size-[3px] rounded-sm bg-border" />
					) : null}
					{part}
				</span>
			))}
		</div>
	);
}

export function MarketingEditorShell({
	backHref,
	backLabel,
	name,
	onNameChange,
	badges,
	tabs,
	actions,
	meta,
	rail,
	children,
}: {
	backHref: string;
	backLabel: string;
	name: string;
	onNameChange?: (name: string) => void;
	badges?: ReactNode;
	tabs?: ReactNode;
	actions?: ReactNode;
	meta?: ReactNode;
	rail?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<header className="flex shrink-0 flex-col gap-1.5 border-b py-4 pr-4 pl-6">
				<div className="flex items-center gap-2">
					<Button
						asChild
						variant="ghost"
						size="sm"
						className="-ml-2 gap-1.5 font-normal text-muted-foreground"
					>
						<Link href={backHref} prefetch>
							<Icon icon={ArrowLeft} className="size-3.5" />
							{backLabel}
						</Link>
					</Button>

					<span className="h-3.5 w-px bg-border" />

					{onNameChange ? (
						<Input
							value={name}
							onChange={(event) => onNameChange(event.target.value)}
							aria-label="Name"
							className="h-7 max-w-xs border-0 bg-transparent px-1 font-medium text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
						/>
					) : (
						<h1 className="truncate font-medium text-xs">{name}</h1>
					)}

					{badges}

					<div className="flex-1" />

					{tabs}

					{actions}
				</div>

				{meta}
			</header>

			<div className="flex min-h-0 w-full flex-1">
				{children}
				{rail}
			</div>
		</div>
	);
}
