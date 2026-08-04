"use client";

import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import {
	formatDay,
	formatMoney,
	relativeTimeFromIso,
} from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AgentPanel } from "@/components/crm/agent-panel";
import {
	InlineDateField,
	InlineField,
	InlineSelectField,
	savingField,
} from "@/components/crm/inline-field";
import { OwnerCell } from "@/components/crm/owner-cell";
import { DealStageMenu } from "@/components/crm/stage-change";
import { StageStepper } from "@/components/crm/stage-stepper";
import { Timeline } from "@/components/crm/timeline/timeline";
import {
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetSection,
	DetailSheetStat,
	DetailSheetStats,
	type DetailSheetTab,
} from "@/components/detail-sheet";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { RecordSheetFrame } from "./record-parts";
import { useOpenRecord, useRecordSheetView } from "./record-stack";

type Deal = RouterOutputs["deals"]["byId"];

const CONTACT_COLUMNS = [
	{ header: "Name", width: "w-[30%]", className: "pl-5" },
	{ header: "Role", width: "w-[20%]" },
	{ header: "Title", width: "w-[25%]" },
	{ header: "Email", width: "w-[25%]" },
];

const dateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

export function DealSheet({ dealId }: { dealId: string }) {
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const { tab, setTab } = useRecordSheetView("overview");

	const query = useQuery(trpc.deals.byId.queryOptions({ id: dealId }));
	const deal = query.data;
	const company = deal?.company ?? null;

	const tabs: DetailSheetTab[] = deal
		? [
				{
					value: "overview",
					label: "Overview",
					content: <DealOverview deal={deal} />,
				},
				{
					value: "contacts",
					label: "Contacts",
					count: deal.contacts.length,
					content: <DealContacts deal={deal} />,
				},
				{
					value: "activity",
					label: "Activity",
					content: <Timeline anchor={{ dealId: deal.id }} />,
				},
				{
					value: "agent",
					label: "Agent",
					content: <AgentPanel record={{ kind: "deal", id: deal.id }} />,
					keepMounted: true,
				},
			]
		: [];

	return (
		<RecordSheetFrame
			loading={query.isPending}
			error={query.error?.message ?? null}
			title={deal?.name ?? "Deal"}
			description={
				company ? (
					<button
						type="button"
						onClick={() => openRecord({ kind: "company", id: company.id })}
						className="text-foreground underline-offset-2 hover:underline"
					>
						{company.name}
					</button>
				) : undefined
			}
			media={
				company ? (
					<EntityLogo
						src={company.iconUrl}
						darkSrc={company.iconDarkUrl}
						tone={company.iconTone as EntityLogoTone | null | undefined}
						name={company.name}
						size="lg"
					/>
				) : null
			}
			actions={
				deal ? (
					<DealStageMenu
						dealId={deal.id}
						stage={deal.stage}
						variant="control"
					/>
				) : null
			}
			stats={
				deal ? (
					<DetailSheetStats>
						<DetailSheetStat label="Amount">
							{deal.amountCents === null ? (
								<EmptyCellValue />
							) : (
								<span className="tabular-nums">
									{formatMoney(deal.amountCents, deal.currency)}
								</span>
							)}
						</DetailSheetStat>
						<DetailSheetStat label="Expected close">
							{deal.expectedCloseDate ? (
								formatDay(deal.expectedCloseDate)
							) : (
								<EmptyCellValue />
							)}
						</DetailSheetStat>
						<DetailSheetStat label="In stage">
							{relativeTimeFromIso(deal.stageChangedAt)}
						</DetailSheetStat>
						<DetailSheetStat label="Owner">
							<OwnerCell owner={deal.owner} />
						</DetailSheetStat>
					</DetailSheetStats>
				) : null
			}
			tabs={tabs}
			tab={tab}
			onTabChange={setTab}
		/>
	);
}

function DealOverview({ deal }: { deal: Deal }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const users = useQuery(trpc.users.list.queryOptions());
	const companies = useQuery(trpc.companies.options.queryOptions({ q: "" }));

	const update = useMutation(
		trpc.deals.update.mutationOptions({
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const save = (data: Parameters<typeof update.mutate>[0]["data"]) =>
		update.mutate({ id: deal.id, data });

	const isSaving = savingField(update);

	return (
		<DetailSheetBody>
			<DetailSheetSection title="Stage">
				<StageStepper dealId={deal.id} stage={deal.stage} />

				{deal.closedReason ? (
					<DetailSheetProperties>
						<DetailSheetProperty label="Closed">
							{deal.closedAt ? (
								dateFormat.format(new Date(deal.closedAt))
							) : (
								<EmptyCellValue />
							)}
						</DetailSheetProperty>
						<DetailSheetProperty label="Reason" wide>
							{deal.closedReason}
						</DetailSheetProperty>
					</DetailSheetProperties>
				) : null}
			</DetailSheetSection>

			<DetailSheetSection title="Details">
				<DetailSheetProperties>
					<InlineField
						label="Name"
						value={deal.name}
						saving={isSaving("name")}
						onSave={(name) => name && save({ name })}
					/>
					<InlineField
						label="Amount"
						value={
							deal.amountCents === null ? null : String(deal.amountCents / 100)
						}
						placeholder="24000"
						saving={isSaving("amountCents")}
						onSave={(next) => {
							if (next === "") return save({ amountCents: null });
							const parsed = Number.parseFloat(next);
							if (!Number.isFinite(parsed) || parsed < 0) {
								toast.error("Amount has to be a number.");
								return;
							}
							save({ amountCents: Math.round(parsed * 100) });
						}}
						render={(value) =>
							formatMoney(Math.round(Number(value) * 100), deal.currency)
						}
					/>
					<InlineField
						label="Currency"
						value={deal.currency}
						saving={isSaving("currency")}
						onSave={(currency) => {
							if (currency.length !== 3) {
								toast.error("Use a three-letter currency code, like EUR.");
								return;
							}
							save({ currency: currency.toUpperCase() });
						}}
					/>
					<InlineDateField
						label="Close date"
						value={deal.expectedCloseDate}
						saving={isSaving("expectedCloseDate")}
						onSave={(next) => save({ expectedCloseDate: next || null })}
					/>
					<InlineSelectField
						label="Company"
						value={deal.company?.id ?? ""}
						options={(companies.data ?? []).map((company) => ({
							value: company.id,
							label: company.name,
						}))}
						onSave={(companyId) => save({ companyId })}
					/>
					<InlineSelectField
						label="Owner"
						value={deal.owner.id}
						options={(users.data ?? []).map((user) => ({
							value: user.id,
							label: user.name,
						}))}
						onSave={(ownerId) => save({ ownerId })}
					/>
				</DetailSheetProperties>
			</DetailSheetSection>
		</DetailSheetBody>
	);
}

function DealContacts({ deal }: { deal: Deal }) {
	const openRecord = useOpenRecord();

	if (deal.contacts.length === 0) {
		return (
			<DetailSheetEmpty
				icon={UserMultiple}
				title="No contacts on this deal"
				description={
					deal.company
						? `Nobody from ${deal.company.name} is attached yet. Add people to the company, then bring them onto the deal.`
						: "No contacts are attached to this direct lead yet."
				}
			/>
		);
	}

	return (
		<SimpleTable variant="panel" columns={CONTACT_COLUMNS}>
			{deal.contacts.map((contact) => (
				<SimpleTableRow
					key={contact.id}
					clickable
					onClick={() => openRecord({ kind: "contact", id: contact.id })}
				>
					<TableCell className="truncate py-2.5 pr-3 pl-5 font-medium">
						<span className="flex min-w-0 items-center gap-2">
							<PersonAvatar
								src={contact.imageUrl}
								name={[contact.firstName, contact.lastName]
									.filter(Boolean)
									.join(" ")}
								email={contact.email}
								size="sm"
							/>
							<span className="truncate">
								{[contact.firstName, contact.lastName]
									.filter(Boolean)
									.join(" ")}
							</span>
						</span>
					</TableCell>
					<TableCell className="truncate px-3 py-2.5">
						{contact.role ?? <EmptyCellValue />}
					</TableCell>
					<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
						{contact.title ?? <EmptyCellValue />}
					</TableCell>
					<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
						{contact.email ?? <EmptyCellValue />}
					</TableCell>
				</SimpleTableRow>
			))}
		</SimpleTable>
	);
}
