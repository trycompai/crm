"use client";

import Email from "@carbon/icons-react/es/Email";
import Partnership from "@carbon/icons-react/es/Partnership";
import Star from "@carbon/icons-react/es/Star";
import type { FieldValueJson } from "@crm/db/fields";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AgentPanel } from "@/components/crm/agent-panel";
import { InlineCompanyField } from "@/components/crm/company-picker";
import { contactName } from "@/components/crm/contact-name";
import { ContactEnrichmentAction } from "@/components/crm/enrichment-actions";
import { EnrichmentIndicator } from "@/components/crm/enrichment-status";
import { FactProvenance, FactSuggestion } from "@/components/crm/facts";
import { FieldsCog, RecordFields } from "@/components/crm/fields/record-fields";
import {
	InlineField,
	InlineSelectField,
	savingValue,
} from "@/components/crm/inline-field";
import { OwnerCell } from "@/components/crm/owner-cell";
import { ContactSocials } from "@/components/crm/social-links";
import { DealStageMenu } from "@/components/crm/stage-change";
import { Timeline } from "@/components/crm/timeline/timeline";
import { WebsiteActivity } from "@/components/crm/website-activity";
import {
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetProse,
	DetailSheetSection,
	DetailSheetStat,
	DetailSheetStats,
	type DetailSheetTab,
} from "@/components/detail-sheet";
import { LocalDateTime, LocalRelativeDate } from "@/components/local-date-time";
import { factsByField } from "@/lib/contact-facts";
import { ENRICHMENT_POLL_MS, isEnriching } from "@/lib/enrichment-status";
import { savingField } from "@/lib/pending-field";
import { hasContactLinks } from "@/lib/social-links";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { RecordActions } from "./record-actions";
import { DealAmount, MetaLine, RecordSheetFrame } from "./record-parts";
import { useOpenRecord, useRecordSheetView } from "./record-stack";

type Contact = RouterOutputs["contacts"]["byId"];

const NONE = "none";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	year: "numeric",
};

const DEAL_COLUMNS = [
	{ id: "deal", header: "Deal", width: "w-[32%]", className: "pl-5" },
	{ id: "role", header: "Role", width: "w-[16%]" },
	{ id: "stage", header: "Stage", width: "w-[22%]" },
	{
		id: "amount",
		header: "Amount",
		width: "w-[16%]",
		align: "right" as const,
	},
	{ id: "owner", header: "Owner", width: "w-[14%]" },
];

export function ContactSheet({ contactId }: { contactId: string }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const { tab, setTab } = useRecordSheetView("overview");

	const query = useQuery({
		...trpc.contacts.byId.queryOptions({ id: contactId }),
		refetchInterval: (current) => {
			const record = current.state.data;
			return record && isEnriching(record.enrichmentStatus, record.queued)
				? ENRICHMENT_POLL_MS
				: false;
		},
	});
	const contact = query.data;

	const setPrimary = useMutation(
		trpc.companies.setPrimaryContact.mutationOptions({
			onSuccess: async () => {
				await cache.contact(contactId);
				toast.success("Primary contact updated.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const tabs: DetailSheetTab[] = contact
		? [
				{
					value: "overview",
					label: "Overview",
					content: <ContactOverview contact={contact} />,
				},
				{
					value: "deals",
					label: "Deals",
					count: contact.deals.length,
					content: <ContactDeals contact={contact} />,
				},
				{
					value: "activity",
					label: "Activity",
					content: <Timeline anchor={{ contactId: contact.id }} />,
				},
				{
					value: "agent",
					label: "Agent",
					content: <AgentPanel record={{ kind: "contact", id: contact.id }} />,
					keepMounted: true,
				},
			]
		: [];

	return (
		<RecordSheetFrame
			loading={query.isPending}
			error={query.error?.message ?? null}
			title={contact ? contactName(contact) : "Contact"}
			description={
				contact ? (
					<MetaLine parts={[contact.title, contact.company?.name]} />
				) : undefined
			}
			note={
				contact ? (
					<>
						{contact.isPrimaryContact ? (
							<StatusIndicator
								tone="success"
								label={`Primary contact at ${contact.company?.name ?? "this company"}`}
							/>
						) : null}
						{contact.enrichmentStatus !== "COMPLETE" ? (
							<EnrichmentIndicator
								status={contact.enrichmentStatus}
								queued={contact.queued}
								title={contact.enrichmentError}
							/>
						) : null}
					</>
				) : null
			}
			media={
				<PersonAvatar
					src={contact?.imageUrl}
					name={contact ? contactName(contact) : "?"}
					email={contact?.email}
					size="lg"
				/>
			}
			actions={
				contact ? (
					<>
						<ContactEnrichmentAction contactId={contact.id} />
						{contact.email ? (
							<Button asChild variant="outline" size="sm">
								<a href={`mailto:${contact.email}`}>
									<Icon icon={Email} data-icon="inline-start" />
									<span className="hidden sm:inline">Email</span>
								</a>
							</Button>
						) : null}
						{contact.company && !contact.isPrimaryContact ? (
							<Button
								variant="outline"
								size="sm"
								disabled={setPrimary.isPending}
								onClick={() =>
									setPrimary.mutate({
										companyId: contact.company?.id ?? "",
										contactId: contact.id,
									})
								}
							>
								<Icon icon={Star} data-icon="inline-start" />
								<span className="hidden sm:inline">Make primary</span>
							</Button>
						) : null}
						<RecordActions
							record={{ kind: "contact", id: contact.id }}
							name={contactName(contact)}
							consequence={`Their notes, agent conversations and everything the agent found go too; emails and meetings stay filed against the company.${contact.email ? ` The sync will not bring ${contact.email} back — only adding them yourself will.` : ""}`}
						/>
					</>
				) : null
			}
			stats={
				contact ? (
					<DetailSheetStats>
						<DetailSheetStat label="Company">
							{contact.company ? (
								<CompanyStat company={contact.company} />
							) : (
								<EmptyCellValue />
							)}
						</DetailSheetStat>
						<DetailSheetStat label="Email">
							{contact.email ? (
								<a
									href={`mailto:${contact.email}`}
									className="underline-offset-2 hover:underline"
								>
									{contact.email}
								</a>
							) : (
								<EmptyCellValue />
							)}
						</DetailSheetStat>
						<DetailSheetStat label="Phone">
							{contact.phone ? (
								<a
									href={`tel:${contact.phone}`}
									className="underline-offset-2 hover:underline"
								>
									{contact.phone}
								</a>
							) : (
								<EmptyCellValue />
							)}
						</DetailSheetStat>
						<DetailSheetStat label="Owner">
							<OwnerCell owner={contact.owner} />
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

function CompanyStat({
	company,
}: {
	company: NonNullable<Contact["company"]>;
}) {
	const openRecord = useOpenRecord();

	return (
		<button
			type="button"
			onClick={() => openRecord({ kind: "company", id: company.id })}
			className="flex min-w-0 items-center gap-2 underline-offset-2 hover:underline"
		>
			<EntityLogo
				src={company.iconUrl}
				darkSrc={company.iconDarkUrl}
				tone={company.iconTone as EntityLogoTone | null | undefined}
				name={company.name}
				size="xs"
			/>
			<span className="truncate">{company.name}</span>
		</button>
	);
}

function ContactOverview({ contact }: { contact: Contact }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const users = useQuery(trpc.users.list.queryOptions());

	const { applied, proposed } = factsByField(contact.facts);

	const agentProps = (field: string) => {
		const fact = applied.get(field);
		const suggestion = proposed.get(field);
		return {
			provenance: fact ? <FactProvenance fact={fact} /> : undefined,
			suggestion: suggestion ? (
				<FactSuggestion fact={suggestion} contactId={contact.id} />
			) : undefined,
		};
	};

	const update = useMutation(
		trpc.contacts.update.mutationOptions({
			onSuccess: () => cache.contact(contact.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const saveFields = (fields: Record<string, FieldValueJson>) =>
		update.mutate({ id: contact.id, data: { fields } });

	const isSavingField = savingValue(update);

	const save = (data: Record<string, string | null>) =>
		update.mutate({ id: contact.id, data });

	const isSaving = savingField(update);

	return (
		<DetailSheetBody>
			<DetailSheetSection title="Details" action={<FieldsCog kind="contact" />}>
				<DetailSheetProperties>
					<InlineField
						label="First name"
						value={contact.firstName}
						saving={isSaving("firstName")}
						onSave={(firstName) => firstName && save({ firstName })}
					/>
					<InlineField
						label="Last name"
						value={contact.lastName}
						saving={isSaving("lastName")}
						onSave={(lastName) => save({ lastName })}
					/>
					<InlineField
						label="Title"
						value={contact.title}
						placeholder="Head of Security"
						saving={isSaving("title")}
						onSave={(title) => save({ title })}
						{...agentProps("title")}
					/>
					<InlineField
						label="Email"
						value={contact.email}
						type="email"
						saving={isSaving("email")}
						onSave={(email) => save({ email })}
					/>
					<InlineField
						label="Phone"
						value={contact.phone}
						type="tel"
						saving={isSaving("phone")}
						onSave={(phone) => save({ phone })}
					/>
					<InlineField
						label="LinkedIn"
						value={contact.linkedinUrl}
						type="url"
						saving={isSaving("linkedinUrl")}
						onSave={(linkedinUrl) => save({ linkedinUrl })}
						{...agentProps("linkedinUrl")}
					/>
					<InlineField
						label="X"
						value={contact.twitterUrl}
						type="url"
						saving={isSaving("twitterUrl")}
						onSave={(twitterUrl) => save({ twitterUrl })}
						{...agentProps("twitterUrl")}
					/>
					<InlineField
						label="GitHub"
						value={contact.githubUrl}
						type="url"
						saving={isSaving("githubUrl")}
						onSave={(githubUrl) => save({ githubUrl })}
						{...agentProps("githubUrl")}
					/>
					<InlineCompanyField
						value={contact.company?.id ?? NONE}
						company={contact.company}
						saving={isSaving("companyId")}
						none={{ value: NONE, label: "No company" }}
						onSave={(companyId) =>
							save({ companyId: companyId === NONE ? null : companyId })
						}
					/>
					<InlineSelectField
						label="Owner"
						value={contact.owner?.id ?? NONE}
						options={[
							{ value: NONE, label: "Unassigned" },
							...(users.data ?? []).map((user) => ({
								value: user.id,
								label: user.name,
							})),
						]}
						onSave={(ownerId) =>
							save({ ownerId: ownerId === NONE ? null : ownerId })
						}
					/>
					<RecordFields
						fields={contact.fields}
						saving={isSavingField}
						onSave={saveFields}
					/>
				</DetailSheetProperties>
			</DetailSheetSection>

			{contact.brief ? <Background brief={contact.brief} /> : null}

			<WeKnowThem
				relationship={contact.relationship}
				contactName={contactName(contact)}
			/>

			{hasContactLinks(contact) ? (
				<DetailSheetSection title="Links">
					<ContactSocials contact={contact} />
				</DetailSheetSection>
			) : null}

			<WebsiteActivity contactId={contact.id} />
		</DetailSheetBody>
	);
}

function Background({ brief }: { brief: NonNullable<Contact["brief"]> }) {
	const sections = brief.sections;
	const previous = sections.previousRoles ?? [];

	const lines = [
		{ label: "Current role", value: sections.currentRole },
		{ label: "Tenure", value: sections.tenure },
		{ label: "Seniority", value: sections.seniority },
		{ label: "Function", value: sections.function },
		{ label: "Based", value: sections.location },
	].filter((line) => Boolean(line.value));

	return (
		<DetailSheetSection
			title="Background"
			action={
				<span className="text-muted-foreground text-xs">
					{brief.sourceUrl ? (
						<a
							href={brief.sourceUrl}
							target="_blank"
							rel="noreferrer noopener"
							className="underline-offset-2 hover:underline"
						>
							Source
						</a>
					) : null}
					{brief.sourceUrl ? " · " : null}
					<LocalDateTime date={brief.refreshedAt} options={DATE_OPTIONS} />
				</span>
			}
		>
			<DetailSheetProse>{brief.narrative}</DetailSheetProse>

			<DetailSheetProperties>
				{lines.map((line) => (
					<DetailSheetProperty key={line.label} label={line.label}>
						{line.value}
					</DetailSheetProperty>
				))}

				{previous.length > 0 ? (
					<DetailSheetProperty label="Previously" wide>
						<PreviousRoles roles={previous} />
					</DetailSheetProperty>
				) : null}
			</DetailSheetProperties>
		</DetailSheetSection>
	);
}

function PreviousRoles({ roles }: { roles: string[] }) {
	return (
		<Accordion type="single" collapsible>
			<AccordionItem value="previous">
				<AccordionTrigger variant="subtle">
					{roles.length === 1 ? "1 role" : `${roles.length} roles`}
				</AccordionTrigger>
				<AccordionContent>
					<ul className="space-y-1">
						{roles.map((role) => (
							<li key={role}>{role}</li>
						))}
					</ul>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}

function WeKnowThem({
	relationship,
	contactName: name,
}: {
	relationship: Contact["relationship"];
	contactName: string;
}) {
	const { emails, meetings, lastReplyAt, nextMeeting, colleagues } =
		relationship;

	if (emails === 0 && meetings === 0 && colleagues.length === 0) return null;

	const first = name.split(" ")[0] ?? name;

	return (
		<DetailSheetSection title="We know them">
			<DetailSheetProperties>
				{emails > 0 ? (
					<DetailSheetProperty label="Emails">
						<span className="tabular-nums">{emails}</span>
						<span className="text-muted-foreground">
							{" · "}
							{lastReplyAt ? (
								<>
									last reply <LocalRelativeDate date={lastReplyAt} />
								</>
							) : (
								`${first} has never replied`
							)}
						</span>
					</DetailSheetProperty>
				) : null}

				{meetings > 0 ? (
					<DetailSheetProperty label="Meetings">
						<span className="tabular-nums">{meetings}</span>
					</DetailSheetProperty>
				) : null}

				{nextMeeting ? (
					<DetailSheetProperty label="Next meeting" wide>
						{nextMeeting.title ?? "Meeting"}
						<span className="text-muted-foreground">
							{" · "}
							<LocalDateTime
								date={nextMeeting.startsAt}
								options={DATE_OPTIONS}
							/>
						</span>
					</DetailSheetProperty>
				) : null}

				{colleagues.length > 0 ? (
					<DetailSheetProperty label="Also here" wide>
						<Colleagues colleagues={colleagues} />
					</DetailSheetProperty>
				) : null}
			</DetailSheetProperties>
		</DetailSheetSection>
	);
}

function Colleagues({
	colleagues,
}: {
	colleagues: Contact["relationship"]["colleagues"];
}) {
	const openRecord = useOpenRecord();

	return (
		<span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
			{colleagues.map((colleague) => (
				<button
					key={colleague.id}
					type="button"
					onClick={() => openRecord({ kind: "contact", id: colleague.id })}
					className="min-w-0 truncate underline-offset-2 hover:underline"
				>
					{colleague.name}
					{colleague.title ? (
						<span className="text-muted-foreground"> ({colleague.title})</span>
					) : null}
				</button>
			))}
		</span>
	);
}

function ContactDeals({ contact }: { contact: Contact }) {
	const openRecord = useOpenRecord();

	if (contact.deals.length === 0) {
		return (
			<DetailSheetEmpty
				icon={Partnership}
				title="Not on any deals"
				description={`${contactName(contact)} is not attached to anything being sold yet. Deals are opened on the company, then people are added to them.`}
			/>
		);
	}

	return (
		<SimpleTable variant="panel" columns={DEAL_COLUMNS}>
			{contact.deals.map((deal) => (
				<SimpleTableRow
					key={deal.id}
					clickable
					onClick={() => openRecord({ kind: "deal", id: deal.id })}
				>
					<TableCell className="truncate py-2.5 pr-3 pl-5 font-medium">
						{deal.name}
					</TableCell>
					<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
						{deal.role ?? <EmptyCellValue />}
					</TableCell>
					<TableCell className="px-3 py-2.5">
						<DealStageMenu dealId={deal.id} stage={deal.stage} />
					</TableCell>
					<TableCell className="px-3 py-2.5 text-right">
						<DealAmount
							amountCents={deal.amountCents}
							currency={deal.currency}
						/>
					</TableCell>
					<TableCell className="px-3 py-2.5">
						<OwnerCell owner={deal.owner} />
					</TableCell>
				</SimpleTableRow>
			))}
		</SimpleTable>
	);
}
