"use client";

import {
	OutreachStep,
	type ProductKey,
	type ProspectStatus,
} from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Textarea } from "@crm/ui/components/textarea";
import { relativeTimeFromIso } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { prospectingSearchParams } from "./prospecting-search-params";

type ProspectRow = RouterOutputs["prospecting"]["list"]["rows"][number];
type Prospect = RouterOutputs["prospecting"]["byId"];

const STATUS_LABELS: Record<string, string> = {
	DISCOVERED: "Discovered",
	ENRICHING: "Researching",
	REVIEW: "Needs review",
	APPROVED: "Approved",
	CONTACTED: "Contacted",
	REPLIED: "Replied",
	QUALIFIED: "Qualified",
	CONVERTED: "Converted",
	REJECTED: "Rejected",
	SUPPRESSED: "Suppressed",
	EXPIRED: "Expired",
};

const PRODUCT_LABELS: Record<string, string> = {
	BEAMDEPLOY: "BeamDeploy",
	PROPMARGIN: "PropMargin",
	ARQUIVO_FATURAS: "Arquivo de Faturas",
};

const COLUMNS: DataTableColumn<ProspectRow>[] = [
	{
		id: "name",
		header: "Prospect",
		sortable: true,
		hideable: false,
		width: "w-[26%]",
		cell: (row) => (
			<div className="min-w-0">
				<p className="truncate font-medium">{row.name}</p>
				<p className="truncate text-muted-foreground">
					{row.companyName ?? row.domain ?? row.email}
				</p>
			</div>
		),
	},
	{
		id: "product",
		header: "Product",
		width: "w-[17%]",
		cell: (row) => PRODUCT_LABELS[row.productId] ?? row.productId,
	},
	{
		id: "status",
		header: "Status",
		sortable: true,
		width: "w-[17%]",
		cell: (row) => (
			<span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs">
				{STATUS_LABELS[row.status] ?? row.status}
			</span>
		),
	},
	{
		id: "score",
		header: "Score",
		sortable: true,
		align: "right",
		width: "w-[10%]",
		cell: (row) => (
			<span className="font-medium tabular-nums">{row.totalScore}</span>
		),
	},
	{
		id: "email",
		header: "Contact",
		width: "w-[22%]",
		hideBelow: "md",
		cell: (row) => (
			<span className="truncate text-muted-foreground">
				{row.email ?? "No verified email"}
			</span>
		),
	},
	{
		id: "createdAt",
		header: "Found",
		sortable: true,
		align: "right",
		width: "w-[12%]",
		hideBelow: "lg",
		cell: (row) => (
			<span className="text-muted-foreground" suppressHydrationWarning>
				{relativeTimeFromIso(row.createdAt)}
			</span>
		),
	},
];

export function ProspectingTable() {
	const trpc = useTRPC();
	const { query, input } = useTableQuery(prospectingSearchParams);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const prospects = useQuery({
		...trpc.prospecting.list.queryOptions({
			...input,
			product: input.product as ProductKey | "all",
			status: input.status as ProspectStatus | "all",
		}),
		placeholderData: (previous) => previous,
	});

	const facets: DataTableFacet[] = [
		{
			id: "product",
			label: "Product",
			options: Object.entries(PRODUCT_LABELS).map(([value, label]) => ({
				value,
				label,
			})),
		},
	];

	return (
		<>
			<DataTable
				query={query}
				columns={COLUMNS}
				rows={prospects.data?.rows ?? []}
				total={prospects.data?.total ?? 0}
				facetCounts={prospects.data?.facetCounts}
				facets={facets}
				tabs={{
					id: "status",
					allLabel: "All prospects",
					options: [
						"REVIEW",
						"APPROVED",
						"CONTACTED",
						"REPLIED",
						"QUALIFIED",
						"CONVERTED",
						"REJECTED",
						"SUPPRESSED",
					].map((value) => ({ value, label: STATUS_LABELS[value] ?? value })),
				}}
				getRowId={(row) => row.id}
				loading={prospects.isFetching}
				onRowClick={(row) => setSelectedId(row.id)}
				empty="No prospects match this view. Activate a product to start discovery."
				meta={`${prospects.data?.total ?? 0} prospects`}
			/>
			<ProspectDialog id={selectedId} onClose={() => setSelectedId(null)} />
		</>
	);
}

function ProspectDialog({
	id,
	onClose,
}: {
	id: string | null;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const prospect = useQuery({
		...trpc.prospecting.byId.queryOptions({ id: id ?? "" }),
		enabled: Boolean(id),
	});
	const refresh = () => cache.prospecting(id ?? undefined);
	const approve = useMutation(
		trpc.prospecting.approve.mutationOptions({
			onSuccess: refresh,
			onError: showError,
		}),
	);
	const reject = useMutation(
		trpc.prospecting.reject.mutationOptions({
			onSuccess: refresh,
			onError: showError,
		}),
	);
	const suppress = useMutation(
		trpc.prospecting.suppress.mutationOptions({
			onSuccess: refresh,
			onError: showError,
		}),
	);
	const approveMessage = useMutation(
		trpc.prospecting.approveMessage.mutationOptions({
			onSuccess: refresh,
			onError: showError,
		}),
	);
	const send = useMutation(
		trpc.prospecting.sendApproved.mutationOptions({
			onSuccess: refresh,
			onError: showError,
		}),
	);
	const convert = useMutation(
		trpc.prospecting.convert.mutationOptions({
			onSuccess: refresh,
			onError: showError,
		}),
	);

	return (
		<Dialog open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
				{prospect.data ? (
					<ProspectDetail
						prospect={prospect.data}
						onApprove={() => approve.mutate({ id: prospect.data.id })}
						onReject={(reason) =>
							reject.mutate({ id: prospect.data.id, reason })
						}
						onSuppress={(reason) =>
							suppress.mutate({ id: prospect.data.id, reason })
						}
						onApproveMessage={(messageId) =>
							approveMessage.mutate({ id: messageId })
						}
						onSend={(messageId) => send.mutate({ id: messageId })}
						onConvert={() => convert.mutate({ id: prospect.data.id })}
						onRefresh={refresh}
					/>
				) : (
					<p className="text-muted-foreground">Loading prospect…</p>
				)}
			</DialogContent>
		</Dialog>
	);
}

function ProspectDetail({
	prospect,
	onApprove,
	onReject,
	onSuppress,
	onApproveMessage,
	onSend,
	onConvert,
	onRefresh,
}: {
	prospect: Prospect;
	onApprove: () => void;
	onReject: (reason: string) => void;
	onSuppress: (reason: string) => void;
	onApproveMessage: (id: string) => void;
	onSend: (id: string) => void;
	onConvert: () => void;
	onRefresh: () => Promise<void>;
}) {
	const trpc = useTRPC();
	const [reason, setReason] = useState(
		"Not a suitable recipient for this campaign.",
	);
	const [step, setStep] = useState<OutreachStep>(OutreachStep.FIRST_TOUCH);
	const [recipientEmail, setRecipientEmail] = useState(prospect.email ?? "");
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	useEffect(() => setRecipientEmail(prospect.email ?? ""), [prospect.email]);

	const saveDraft = useMutation(
		trpc.prospecting.saveDraft.mutationOptions({
			onSuccess: async () => {
				toast.success("Draft saved for approval.");
				setSubject("");
				setBody("");
				await onRefresh();
			},
			onError: showError,
		}),
	);

	return (
		<>
			<DialogHeader>
				<DialogTitle>{prospect.name}</DialogTitle>
				<DialogDescription>
					{PRODUCT_LABELS[prospect.productId]} ·{" "}
					{prospect.companyName ?? prospect.domain ?? prospect.email} · score{" "}
					{prospect.totalScore}
				</DialogDescription>
			</DialogHeader>

			<div className="grid gap-5 md:grid-cols-2">
				<section className="space-y-3">
					<h3 className="font-medium text-sm">Qualification</h3>
					<div className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-center">
						<Score label="Fit" value={prospect.fitScore} />
						<Score label="Intent" value={prospect.intentScore} />
						<Score label="Contact" value={prospect.contactabilityScore} />
					</div>
					<p className="text-muted-foreground text-xs">
						{prospect.scoreRationale ??
							prospect.eligibilityReason ??
							"No rationale recorded yet."}
					</p>
					<div className="space-y-2">
						{prospect.evidence.map((item) => (
							<a
								key={item.id}
								href={item.sourceUrl}
								target="_blank"
								rel="noreferrer"
								className="block rounded-md border p-2 text-xs hover:bg-muted"
							>
								<span className="font-medium">{item.sourceName}</span>
								<span className="block text-muted-foreground">
									{item.detail}
								</span>
							</a>
						))}
					</div>
					{prospect.status === "REVIEW" ? (
						<Button size="sm" onClick={onApprove}>
							Approve prospect
						</Button>
					) : null}
					{prospect.status === "REPLIED" || prospect.status === "QUALIFIED" ? (
						<Button size="sm" onClick={onConvert}>
							Convert to deal
						</Button>
					) : null}
					<Label className="flex flex-col items-start gap-1">
						Decision reason
						<Textarea
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							rows={2}
						/>
					</Label>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => onReject(reason)}
						>
							Reject
						</Button>
						<Button
							variant="destructive"
							size="sm"
							onClick={() => onSuppress(reason)}
						>
							Suppress
						</Button>
					</div>
				</section>

				<section className="space-y-3">
					<h3 className="font-medium text-sm">Outreach</h3>
					{prospect.messages.map((message) => (
						<div
							key={message.id}
							className="space-y-2 rounded-lg border p-3 text-xs"
						>
							<div className="flex justify-between gap-2">
								<span className="font-medium">
									{message.step.replaceAll("_", " ")}
								</span>
								<span className="text-muted-foreground">{message.status}</span>
							</div>
							<p>{message.subject}</p>
							<p className="whitespace-pre-wrap text-muted-foreground">
								{message.body}
							</p>
							<div className="flex gap-2">
								{message.status === "DRAFT" || message.status === "FAILED" ? (
									<Button
										size="xs"
										variant="outline"
										onClick={() => onApproveMessage(message.id)}
									>
										Approve message
									</Button>
								) : null}
								{message.status === "APPROVED" ? (
									<Button size="xs" onClick={() => onSend(message.id)}>
										Send now
									</Button>
								) : null}
							</div>
						</div>
					))}

					<div className="space-y-2 rounded-lg border p-3">
						<select
							className="h-8 w-full rounded-md border bg-background px-2 text-xs"
							value={step}
							onChange={(event) => setStep(event.target.value as OutreachStep)}
						>
							<option value={OutreachStep.FIRST_TOUCH}>First touch</option>
							<option value={OutreachStep.FOLLOW_UP_ONE}>
								Follow-up · business day 4
							</option>
							<option value={OutreachStep.FOLLOW_UP_TWO}>
								Follow-up · business day 10
							</option>
						</select>
						<Input
							placeholder="Recipient email"
							value={recipientEmail}
							onChange={(event) => setRecipientEmail(event.target.value)}
						/>
						<Input
							placeholder="Subject"
							value={subject}
							onChange={(event) => setSubject(event.target.value)}
						/>
						<Textarea
							placeholder="Personalised message"
							rows={6}
							value={body}
							onChange={(event) => setBody(event.target.value)}
						/>
						<Button
							size="sm"
							disabled={
								saveDraft.isPending || !recipientEmail || !subject || !body
							}
							onClick={() =>
								saveDraft.mutate({
									candidateId: prospect.id,
									step,
									recipientEmail,
									subject,
									body,
								})
							}
						>
							Save draft
						</Button>
					</div>
				</section>
			</div>
			<DialogFooter showCloseButton />
		</>
	);
}

function Score({ label, value }: { label: string; value: number }) {
	return (
		<div>
			<p className="font-medium tabular-nums">{value}</p>
			<p className="text-muted-foreground">{label}</p>
		</div>
	);
}

function showError(error: { message: string }) {
	toast.error(error.message);
}
