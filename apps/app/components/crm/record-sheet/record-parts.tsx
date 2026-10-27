"use client";

import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import {
	RecordSheetBar,
	RecordSheetBody,
	RecordSheetHeader,
	RecordSheetLoading,
	type RecordSheetTab,
} from "@crm/ui/components/record-sheet";
import { SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import { formatMoney } from "@crm/ui/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { contactName } from "@/components/crm/contact-name";
import { useTRPC } from "@/lib/trpc/client";
import {
	type RecordKind,
	type RecordRef,
	useRecordStack,
} from "./record-stack";

const KIND_LABEL = {
	company: "Company",
	contact: "Contact",
	deal: "Deal",
} satisfies Record<RecordKind, string>;

function useRecordName(ref: RecordRef | undefined): string | null {
	const trpc = useTRPC();
	const client = useQueryClient();

	if (!ref) return null;

	if (ref.kind === "company") {
		return (
			client.getQueryData(trpc.companies.byId.queryKey({ id: ref.id }))?.name ??
			null
		);
	}

	if (ref.kind === "contact") {
		const contact = client.getQueryData(
			trpc.contacts.byId.queryKey({ id: ref.id }),
		);
		return contact ? contactName(contact) : null;
	}

	return (
		client.getQueryData(trpc.deals.byId.queryKey({ id: ref.id }))?.name ?? null
	);
}

export function RecordSheetFrame({
	kind,
	loading,
	error,
	title,
	media,
	pills,
	actions,
	tabs,
	tab,
	onTabChange,
	rail,
}: {
	kind: RecordKind;
	loading: boolean;
	error: string | null;
	title: string;
	media?: ReactNode;
	pills?: ReactNode;
	actions?: ReactNode;
	tabs: RecordSheetTab[];
	tab: string;
	onTabChange: (tab: string) => void;
	rail?: ReactNode;
}) {
	const { stack, close, closeAll, navigation } = useRecordStack();
	const previous = stack.length > 1 ? stack.at(-2) : undefined;
	const previousName = useRecordName(previous);

	return (
		<>
			<RecordSheetBar
				label={KIND_LABEL[kind]}
				navigation={navigation}
				back={
					previous
						? {
								label: previousName ? `Back to ${previousName}` : "Back",
								onBack: close,
							}
						: undefined
				}
				onClose={closeAll}
			/>

			<RecordSheetHeader
				title={loading || error ? KIND_LABEL[kind] : title}
				loading={loading}
				media={media}
				pills={pills}
				actions={actions}
			/>

			{loading ? (
				<RecordSheetLoading tabs={tabs.length} />
			) : error ? (
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
					<p className="font-medium text-sm">This record could not be loaded</p>
					<p className="text-muted-foreground text-sm">{error}</p>
				</div>
			) : (
				<RecordSheetBody
					tabs={tabs}
					value={tab}
					onValueChange={onTabChange}
					rail={rail}
				/>
			)}
		</>
	);
}

export function AddRow({
	label,
	columns,
	onClick,
}: {
	label: string;
	columns: number;
	onClick: () => void;
}) {
	return (
		<SimpleTableRow>
			<TableCell colSpan={columns} className="p-0">
				<Button
					variant="ghost"
					size="sm"
					onClick={onClick}
					className="h-9 w-full justify-start px-0 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
				>
					<Icon icon={PlusIcon} data-icon="inline-start" />
					{label}
				</Button>
			</TableCell>
		</SimpleTableRow>
	);
}

export function DealAmount({
	amountCents,
	currency,
}: {
	amountCents: number | null;
	currency: string;
}) {
	if (amountCents === null) return <EmptyCellValue />;
	return (
		<span className="tabular-nums">{formatMoney(amountCents, currency)}</span>
	);
}

export function MetaLine({
	lead,
	parts,
}: {
	lead?: ReactNode;
	parts: (string | null | undefined)[];
}) {
	const seen = new Set<string>();
	const rest: string[] = [];

	for (const part of parts) {
		const value = part?.trim();
		if (!value) continue;

		const key = value.toLowerCase();
		if (seen.has(key)) continue;

		seen.add(key);
		rest.push(value);
	}

	return (
		<span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
			{lead}
			{rest.map((part) => (
				<span key={part}>{part}</span>
			))}
		</span>
	);
}

export function DomainLink({
	domain,
	website,
}: {
	domain: string | null;
	website: string | null;
}) {
	const href = website ?? (domain ? `https://${domain}` : null);
	const label = domain ?? website;
	if (!href || !label) return null;

	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer noopener"
			onClick={(event) => event.stopPropagation()}
			className="text-foreground underline-offset-2 hover:underline"
		>
			{label}
		</a>
	);
}
