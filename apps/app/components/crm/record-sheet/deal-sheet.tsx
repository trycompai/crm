"use client";

import Add from "@carbon/icons-react/es/Add";
import Close from "@carbon/icons-react/es/Close";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { CURRENCIES, normalizeCurrency } from "@crm/db/currency";
import type { FieldValueJson } from "@crm/db/fields";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { Icon } from "@crm/ui/components/icon";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AgentPanel } from "@/components/crm/agent-panel";
import { InlineCompanyField } from "@/components/crm/company-picker";
import { contactName } from "@/components/crm/contact-name";
import {
	type DealNextAction,
	dealNextAction,
} from "@/components/crm/deal-next-action";
import { FieldsCog, RecordFields } from "@/components/crm/fields/record-fields";
import {
	InlineDateField,
	InlineField,
	InlineSelectField,
	InlineTextArea,
	InlineTextCell,
	savingValue,
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
import {
	LocalDateTime,
	LocalDay,
	LocalRelativeTime,
} from "@/components/local-date-time";
import { savingField } from "@/lib/pending-field";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { AttachDealContact } from "./quick-add";
import { RecordActions } from "./record-actions";
import { AddRow, RecordSheetFrame } from "./record-parts";
import { useOpenRecord, useRecordSheetView } from "./record-stack";

type Deal = RouterOutputs["deals"]["byId"];

const CURRENCY_OPTIONS = CURRENCIES.map((entry) => ({
	value: entry.code,
	label: `${entry.code} · ${entry.name}`,
}));

function dealCurrency(currency: string) {
	return normalizeCurrency(currency) || currency;
}

function currencyOptions(currency: string) {
	if (CURRENCY_OPTIONS.some((option) => option.value === currency)) {
		return CURRENCY_OPTIONS;
	}

	return [
		{ value: currency, label: `${currency} — no longer supported` },
		...CURRENCY_OPTIONS,
	];
}

function actionFor(deal: Deal): DealNextAction {
	return dealNextAction({
		amountCents: deal.amountCents,
		contactCount: deal.contacts.length,
		expectedCloseDate: deal.expectedCloseDate,
		lastActivityAt: deal.lastActivityAt,
		stage: deal.stage,
	});
}

function DealGate({ label, passed }: { label: string; passed: boolean }) {
	return (
		<div className="flex min-w-0 items-center justify-between gap-4 py-1">
			<span className="min-w-0 text-muted-foreground text-xs/5">{label}</span>
			<div className="shrink-0">
				<StatusIndicator
					tone={passed ? "success" : "warning"}
					label={passed ? "Ready" : "Needed"}
				/>
			</div>
		</div>
	);
}

function DealActionButton({
	action,
	onTab,
	onForm,
}: {
	action: DealNextAction;
	onTab: (tab: string) => void;
	onForm: (form: "contact" | null) => void;
}) {
	const run = () => {
		if (action.kind === "add-contact") {
			onForm("contact");
			onTab("contacts");
			return;
		}
		if (action.kind === "log-activity" || action.kind === "follow-up") {
			onTab("activity");
			return;
		}
		onTab("overview");
	};

	return (
		<Button
			variant={action.kind === "review-outcome" ? "outline" : "default"}
			size="sm"
			onClick={run}
		>
			{action.label}
		</Button>
	);
}

function DealActionView({
	deal,
	onTab,
	onForm,
}: {
	deal: Deal;
	onTab: (tab: string) => void;
	onForm: (form: "contact" | null) => void;
}) {
	const action = actionFor(deal);
	const actionTone =
		action.kind === "advance"
			? "success"
			: action.kind === "review-outcome"
				? "neutral"
				: "warning";

	return (
		<DetailSheetBody>
			<DetailSheetSection
				title="Next sales move"
				action={<StatusIndicator tone={actionTone} label={action.label} />}
			>
				<p className="text-pretty text-muted-foreground text-xs/5">
					{action.description}
				</p>
				<div className="flex flex-wrap items-center gap-2">
					{deal.stage === "CLOSED_WON" ? (
						<Button size="sm" onClick={() => onTab("onboarding")}>
							Run customer onboarding
						</Button>
					) : (
						<DealActionButton action={action} onTab={onTab} onForm={onForm} />
					)}
					<Button variant="outline" size="sm" onClick={() => onTab("activity")}>
						Review history
					</Button>
					<Button variant="outline" size="sm" onClick={() => onTab("agent")}>
						Ask agent
					</Button>
				</div>
			</DetailSheetSection>

			<DetailSheetSection title="Deal readiness">
				<DetailSheetProperties columns={1}>
					<DealGate label="Buyer attached" passed={deal.contacts.length > 0} />
					<DealGate label="Value recorded" passed={deal.amountCents !== null} />
					<DealGate
						label="Close date recorded"
						passed={Boolean(deal.expectedCloseDate)}
					/>
					<DealGate
						label="Sales history started"
						passed={Boolean(deal.lastActivityAt)}
					/>
					<DealGate
						label="Buying context written"
						passed={Boolean(deal.description)}
					/>
				</DetailSheetProperties>
			</DetailSheetSection>

			<DetailSheetSection title="Commercial context">
				<DetailSheetProperties columns={1}>
					<DetailSheetProperty label="Company">
						{deal.company.name}
					</DetailSheetProperty>
					<DetailSheetProperty label="Owner">
						<OwnerCell owner={deal.owner} />
					</DetailSheetProperty>
					<DetailSheetProperty label="Value">
						{deal.amountCents === null ? (
							<EmptyCellValue />
						) : (
							<span className="tabular-nums">
								{formatMoney(deal.amountCents, dealCurrency(deal.currency))}
							</span>
						)}
					</DetailSheetProperty>
					<DetailSheetProperty label="Expected close">
						{deal.expectedCloseDate ? (
							<LocalDay date={deal.expectedCloseDate} />
						) : (
							<EmptyCellValue />
						)}
					</DetailSheetProperty>
					<DetailSheetProperty label="Last activity">
						{deal.lastActivityAt ? (
							<LocalRelativeTime date={deal.lastActivityAt} />
						) : (
							<EmptyCellValue />
						)}
					</DetailSheetProperty>
				</DetailSheetProperties>
			</DetailSheetSection>
		</DetailSheetBody>
	);
}

function ReportedValue({ deal }: { deal: Deal }) {
	const currency = dealCurrency(deal.currency);

	if (currency === deal.reportingCurrency) return null;
	if (deal.amountCents === null) return null;

	return (
		<DetailSheetProperty label={`In ${deal.reportingCurrency}`}>
			{deal.baseAmountCents === null ? (
				<span className="text-muted-foreground">
					No {currency} rate — left out of totals
				</span>
			) : (
				<span className="tabular-nums text-muted-foreground">
					≈ {formatMoney(deal.baseAmountCents, deal.reportingCurrency)}
				</span>
			)}
		</DetailSheetProperty>
	);
}

const CONTACT_COLUMNS = [
	{ id: "name", header: "Name", width: "w-[28%]", className: "pl-5" },
	{ id: "role", header: "Role", width: "w-[20%]" },
	{ id: "title", header: "Title", width: "w-[22%]" },
	{ id: "email", header: "Email", width: "w-[22%]" },
	{ id: "remove", srLabel: "Remove", width: "w-10" },
];

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	year: "numeric",
};

export function DealSheet({ dealId }: { dealId: string }) {
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const {
		tab,
		setTab,
		form: adding,
		setForm: setAdding,
	} = useRecordSheetView("work");

	const query = useQuery({
		...trpc.deals.byId.queryOptions({ id: dealId }),
		refetchInterval: (result) =>
			result.state.data?.stage === "CLOSED_WON" &&
			result.state.data.onboarding &&
			!result.state.data.onboarding.agentPlannedAt
				? 2_000
				: false,
	});
	const deal = query.data;

	const tabs: DetailSheetTab[] = deal
		? [
				{
					value: "work",
					label: "Work",
					content: (
						<DealActionView
							deal={deal}
							onTab={setTab}
							onForm={(form) => setAdding(form)}
						/>
					),
				},
				{
					value: "overview",
					label: "Overview",
					content: <DealOverview deal={deal} />,
				},
				{
					value: "contacts",
					label: "Contacts",
					count: deal.contacts.length,
					content: (
						<DealContacts
							deal={deal}
							adding={adding === "contact"}
							onAdd={() => setAdding("contact")}
							onDone={() => setAdding(null)}
						/>
					),
				},
				{
					value: "activity",
					label: "Activity",
					content: <Timeline anchor={{ dealId: deal.id }} />,
				},
				...(deal.stage === "CLOSED_WON" || deal.onboarding
					? [
							{
								value: "onboarding",
								label: "Customer start",
								count:
									deal.onboarding?.items.filter(
										(item) => item.status !== "COMPLETE",
									).length ?? 0,
								content: <CustomerOnboarding deal={deal} />,
							},
						]
					: []),
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
				deal ? (
					<button
						type="button"
						onClick={() => openRecord({ kind: "company", id: deal.company.id })}
						className="text-foreground underline-offset-2 hover:underline"
					>
						{deal.company.name}
					</button>
				) : undefined
			}
			media={
				deal ? (
					<EntityLogo
						src={deal.company.iconUrl}
						darkSrc={deal.company.iconDarkUrl}
						tone={deal.company.iconTone as EntityLogoTone | null | undefined}
						name={deal.company.name}
						size="lg"
					/>
				) : null
			}
			actions={
				deal ? (
					<>
						<DealStageMenu
							dealId={deal.id}
							stage={deal.stage}
							variant="control"
						/>
						<RecordActions
							record={{ kind: "deal", id: deal.id }}
							name={deal.name}
							consequence={`Its stage history, notes and agent conversations go too. ${deal.company.name} and the ${deal.contacts.length === 1 ? "person" : "people"} on it stay in the CRM.`}
						/>
					</>
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
									{formatMoney(deal.amountCents, dealCurrency(deal.currency))}
								</span>
							)}
						</DetailSheetStat>
						<DetailSheetStat label="Expected close">
							{deal.expectedCloseDate ? (
								<LocalDay date={deal.expectedCloseDate} />
							) : (
								<EmptyCellValue />
							)}
						</DetailSheetStat>
						<DetailSheetStat label="In stage">
							<LocalRelativeTime date={deal.stageChangedAt} />
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

const ONBOARDING_STATUS_OPTIONS = [
	{ value: "DISCOVERY", label: "Discovery" },
	{ value: "SYSTEMS", label: "Systems map" },
	{ value: "DATA_ACCESS", label: "Data access" },
	{ value: "INGESTION", label: "Ingestion" },
	{ value: "READY", label: "Ready to launch" },
	{ value: "LIVE", label: "Live" },
];

const ITEM_STATUS_OPTIONS = [
	{ value: "NOT_STARTED", label: "Not started" },
	{ value: "IN_PROGRESS", label: "In progress" },
	{ value: "BLOCKED", label: "Blocked" },
	{ value: "COMPLETE", label: "Complete" },
];

function CustomerOnboarding({ deal }: { deal: Deal }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const onboarding = deal.onboarding;
	const refresh = () => cache.deal(deal.id, { settle: "record" });
	const update = useMutation(
		trpc.deals.updateOnboarding.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const updateItem = useMutation(
		trpc.deals.updateOnboardingItem.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!onboarding) {
		return (
			<DetailSheetEmpty
				icon={UserMultiple}
				title="Preparing customer onboarding"
				description="The won-deal workflow is creating the systems, data access and Lode Brain plan."
			/>
		);
	}

	const save = (data: Omit<Parameters<typeof update.mutate>[0], "dealId">) =>
		update.mutate({ dealId: deal.id, ...data });

	return (
		<DetailSheetBody>
			<DetailSheetSection
				title="Customer launch"
				action={
					<StatusIndicator
						tone={onboarding.status === "LIVE" ? "success" : "warning"}
						label={
							onboarding.agentPlannedAt ? "Plan ready" : "Agent building plan"
						}
					/>
				}
			>
				<DetailSheetProperties columns={1}>
					<InlineSelectField
						label="Onboarding stage"
						value={onboarding.status}
						options={ONBOARDING_STATUS_OPTIONS}
						onSave={(status) =>
							save({
								status: status as
									| "DISCOVERY"
									| "SYSTEMS"
									| "DATA_ACCESS"
									| "INGESTION"
									| "READY"
									| "LIVE",
							})
						}
					/>
					<InlineDateField
						label="Target live date"
						value={onboarding.targetLiveAt}
						onSave={(targetLiveAt) =>
							save({ targetLiveAt: targetLiveAt || null })
						}
					/>
				</DetailSheetProperties>
			</DetailSheetSection>

			<DetailSheetSection title="Outcome and success measure">
				<InlineTextArea
					label="Outcome and success measure"
					value={onboarding.objective}
					placeholder="What should be true when this customer is live?"
					onSave={(objective) => save({ objective })}
				/>
			</DetailSheetSection>
			<DetailSheetSection title="Existing systems">
				<InlineTextArea
					label="Systems and owners"
					value={onboarding.systemsSummary}
					placeholder="CRM, email, job management, finance, storage and the owner of each."
					onSave={(systemsSummary) => save({ systemsSummary })}
				/>
			</DetailSheetSection>
			<DetailSheetSection title="Structured and unstructured data">
				<InlineTextArea
					label="Data map"
					value={onboarding.dataSummary}
					placeholder="Databases, spreadsheets, documents, email, call notes, images and access constraints."
					onSave={(dataSummary) => save({ dataSummary })}
				/>
			</DetailSheetSection>
			<DetailSheetSection title="Lode Brain plan">
				<InlineTextArea
					label="Ingestion and first use case"
					value={onboarding.brainPlan}
					placeholder="First sources, permissions, ingestion order, proof and first operational workflow."
					onSave={(brainPlan) => save({ brainPlan })}
				/>
			</DetailSheetSection>

			{onboarding.items.map((item) => (
				<DetailSheetSection
					key={item.id}
					title={item.name}
					action={
						<StatusIndicator
							tone={
								item.status === "COMPLETE"
									? "success"
									: item.status === "BLOCKED"
										? "warning"
										: "neutral"
							}
							label={item.kind.replaceAll("_", " ").toLowerCase()}
						/>
					}
				>
					{item.details ? (
						<p className="text-pretty text-muted-foreground text-xs/5">
							{item.details}
						</p>
					) : null}
					<DetailSheetProperties columns={1}>
						<InlineSelectField
							label="Status"
							value={item.status}
							options={ITEM_STATUS_OPTIONS}
							onSave={(status) =>
								updateItem.mutate({
									id: item.id,
									dealId: deal.id,
									status: status as
										| "NOT_STARTED"
										| "IN_PROGRESS"
										| "BLOCKED"
										| "COMPLETE",
								})
							}
						/>
						<DetailSheetProperty label="Owner">
							{item.ownerName ?? <EmptyCellValue />}
						</DetailSheetProperty>
					</DetailSheetProperties>
				</DetailSheetSection>
			))}
		</DetailSheetBody>
	);
}

function DealOverview({ deal }: { deal: Deal }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const users = useQuery(trpc.users.list.queryOptions());

	const update = useMutation(
		trpc.deals.update.mutationOptions({
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const saveFields = (fields: Record<string, FieldValueJson>) =>
		update.mutate({ id: deal.id, data: { fields } });

	const isSavingField = savingValue(update);

	const save = (data: Parameters<typeof update.mutate>[0]["data"]) =>
		update.mutate({ id: deal.id, data });

	const currency = dealCurrency(deal.currency);

	const isSaving = savingField(update);

	return (
		<DetailSheetBody>
			<DetailSheetSection title="Stage">
				<StageStepper dealId={deal.id} stage={deal.stage} />

				{deal.closedReason ? (
					<DetailSheetProperties>
						<DetailSheetProperty label="Closed">
							{deal.closedAt ? (
								<LocalDateTime date={deal.closedAt} options={DATE_OPTIONS} />
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

			<DetailSheetSection title="Details" action={<FieldsCog kind="deal" />}>
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
							formatMoney(Math.round(Number(value) * 100), currency)
						}
					/>
					<InlineSelectField
						label="Currency"
						value={currency}
						options={currencyOptions(currency)}
						onSave={(currency) => save({ currency })}
					/>
					<ReportedValue deal={deal} />
					<InlineDateField
						label="Close date"
						value={deal.expectedCloseDate}
						saving={isSaving("expectedCloseDate")}
						onSave={(next) => save({ expectedCloseDate: next || null })}
					/>
					<InlineCompanyField
						value={deal.company.id}
						company={deal.company}
						saving={isSaving("companyId")}
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
					<RecordFields
						fields={deal.fields}
						saving={isSavingField}
						onSave={saveFields}
					/>
				</DetailSheetProperties>
			</DetailSheetSection>

			<DetailSheetSection title="Description">
				<InlineTextArea
					label="Description"
					value={deal.description}
					placeholder={`What ${deal.company.name} is buying, why now, and what stands in the way.`}
					saving={isSaving("description")}
					onSave={(description) => save({ description })}
				/>
			</DetailSheetSection>

			<WhereItStands deal={deal} />
		</DetailSheetBody>
	);
}

function WhereItStands({ deal }: { deal: Deal }) {
	const openRecord = useOpenRecord();

	return (
		<DetailSheetSection title="Where it stands">
			<DetailSheetProperties>
				<DetailSheetProperty label="Opened">
					<LocalDateTime date={deal.createdAt} options={DATE_OPTIONS} />
				</DetailSheetProperty>

				<DetailSheetProperty label="In stage since">
					<LocalDateTime date={deal.stageChangedAt} options={DATE_OPTIONS} />
				</DetailSheetProperty>

				{deal.closedAt ? (
					<DetailSheetProperty label="Closed">
						<LocalDateTime date={deal.closedAt} options={DATE_OPTIONS} />
					</DetailSheetProperty>
				) : null}

				{deal.closedReason ? (
					<DetailSheetProperty label="Reason" wide>
						{deal.closedReason}
					</DetailSheetProperty>
				) : null}

				<DetailSheetProperty label="On it" wide>
					{deal.contacts.length === 0 ? (
						<span className="text-muted-foreground">
							Nobody from {deal.company.name} is attached yet.
						</span>
					) : (
						<span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
							{deal.contacts.map((contact) => {
								const aside = contact.role ?? contact.title;
								return (
									<button
										key={contact.id}
										type="button"
										onClick={() =>
											openRecord({ kind: "contact", id: contact.id })
										}
										className="min-w-0 truncate underline-offset-2 hover:underline"
									>
										{contactName(contact)}
										{aside ? (
											<span className="text-muted-foreground"> ({aside})</span>
										) : null}
									</button>
								);
							})}
						</span>
					)}
				</DetailSheetProperty>
			</DetailSheetProperties>
		</DetailSheetSection>
	);
}

function DealContacts({
	deal,
	adding,
	onAdd,
	onDone,
}: {
	deal: Deal;
	adding: boolean;
	onAdd: () => void;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();

	const detach = useMutation(
		trpc.deals.detachContact.mutationOptions({
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const setRole = useMutation(
		trpc.deals.setContactRole.mutationOptions({
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const form = adding ? (
		<AttachDealContact
			dealId={deal.id}
			companyName={deal.company.name}
			onDone={onDone}
		/>
	) : null;

	if (deal.contacts.length === 0) {
		return (
			<>
				{form}
				{adding ? null : (
					<DetailSheetEmpty
						icon={UserMultiple}
						title="No contacts on this deal"
						description={`Nobody from ${deal.company.name} is attached yet. Bring the people you are selling to onto the deal and it says who to chase.`}
						action={
							<Button variant="outline" size="sm" onClick={onAdd}>
								<Icon icon={Add} data-icon="inline-start" />
								Add contact
							</Button>
						}
					/>
				)}
			</>
		);
	}

	return (
		<>
			{form}
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
									name={contactName(contact)}
									email={contact.email}
									size="sm"
								/>
								<span className="truncate">{contactName(contact)}</span>
							</span>
						</TableCell>
						<TableCell className="truncate px-1 py-2.5">
							<InlineTextCell
								label={`Role on this deal for ${contactName(contact)}`}
								value={contact.role}
								placeholder="Champion"
								saving={
									setRole.isPending &&
									setRole.variables?.contactId === contact.id
								}
								onSave={(role) =>
									setRole.mutate({
										dealId: deal.id,
										contactId: contact.id,
										role: role || null,
									})
								}
							/>
						</TableCell>
						<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
							{contact.title ?? <EmptyCellValue />}
						</TableCell>
						<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
							{contact.email ?? <EmptyCellValue />}
						</TableCell>
						<TableCell className="px-3 py-2.5">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon-xs"
										disabled={detach.isPending}
										onClick={(event) => {
											event.stopPropagation();
											detach.mutate({
												dealId: deal.id,
												contactId: contact.id,
											});
										}}
									>
										<Icon icon={Close} />
										<span className="sr-only">
											Take {contactName(contact)} off this deal
										</span>
									</Button>
								</TooltipTrigger>
								<TooltipContent>Take off this deal</TooltipContent>
							</Tooltip>
						</TableCell>
					</SimpleTableRow>
				))}

				<AddRow
					label="Add contact"
					columns={CONTACT_COLUMNS.length}
					onClick={onAdd}
				/>
			</SimpleTable>
		</>
	);
}
