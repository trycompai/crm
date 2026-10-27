"use client";

import {
	CommandSearch,
	type CommandSearchItem,
} from "@crm/ui/components/command-search";
import { EntityLogo } from "@crm/ui/components/entity-logo";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Building2Icon,
	HandshakeIcon,
	LayoutDashboardIcon,
	ListChecksIcon,
	type LucideIcon,
	MessagesSquareIcon,
	PlusIcon,
	SearchIcon,
	SettingsIcon,
	UsersIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { COMMAND_SEARCH } from "@/lib/command-search-config";
import {
	entityLogoTone,
	forgetRecentRecord,
	type RecentRecord,
	readRecentRecords,
	recoverRecentRecords,
	resolveRecentRecord,
	useRecentRecordsRaw,
} from "@/lib/recent-records";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceSlug, useWorkspaceUrl } from "@/lib/use-workspace-url";

type RecordKind = RecentRecord["kind"];

const KINDS = {
	company: { group: "Companies", noun: "companies", list: "/companies" },
	contact: { group: "Contacts", noun: "contacts", list: "/contacts" },
	deal: { group: "Deals", noun: "deals", list: "/deals" },
} as const satisfies Record<
	RecordKind,
	{ group: string; noun: string; list: string }
>;

const KIND_ORDER = ["company", "contact", "deal"] as const;

type Destination = {
	id: string;
	label: string;
	href: string;
	icon?: LucideIcon;
	keywords?: string[];
};

const PAGES: Destination[] = [
	{
		id: "overview",
		label: "Overview",
		href: "/",
		icon: LayoutDashboardIcon,
		keywords: ["home", "dashboard", "pipeline"],
	},
	{
		id: "chat",
		label: "Chat",
		href: "/chat",
		icon: MessagesSquareIcon,
		keywords: ["agent", "ask", "agents"],
	},
	{
		id: "companies",
		label: "Companies",
		href: "/companies",
		icon: Building2Icon,
		keywords: ["accounts", "organizations"],
	},
	{
		id: "contacts",
		label: "Contacts",
		href: "/contacts",
		icon: UsersIcon,
		keywords: ["people", "leads"],
	},
	{
		id: "deals",
		label: "Deals",
		href: "/deals",
		icon: HandshakeIcon,
		keywords: ["opportunities", "pipeline", "revenue"],
	},
	{
		id: "tasks",
		label: "Tasks",
		href: "/tasks",
		icon: ListChecksIcon,
		keywords: ["todo", "follow up"],
	},
	{
		id: "settings",
		label: "Settings",
		href: "/settings",
		icon: SettingsIcon,
	},
];

const CREATE: Destination[] = [
	{
		id: "new-company",
		label: "New company",
		href: `/companies?${SEARCH_PARAM.dialog.create}=true`,
		icon: PlusIcon,
		keywords: ["add", "create", "account"],
	},
	{
		id: "new-contact",
		label: "New contact",
		href: `/contacts?${SEARCH_PARAM.dialog.create}=true`,
		icon: PlusIcon,
		keywords: ["add", "create", "person"],
	},
	{
		id: "new-deal",
		label: "New deal",
		href: `/deals?${SEARCH_PARAM.dialog.create}=true`,
		icon: PlusIcon,
		keywords: ["add", "create", "opportunity"],
	},
];

const SETTINGS: Destination[] = [
	{
		id: "settings-general",
		label: "General",
		href: "/settings",
		keywords: ["workspace", "name", "agent model"],
	},
	{
		id: "settings-tracking",
		label: "Tracking & Analytics",
		href: "/settings/tracking",
		keywords: ["script", "website", "forms"],
	},
	{
		id: "settings-connections",
		label: "Connections",
		href: "/settings/connections",
		keywords: ["integrations", "slack", "gmail", "mcp"],
	},
	{
		id: "settings-currencies",
		label: "Currencies",
		href: "/settings/currencies",
		keywords: ["exchange rates", "money"],
	},
	{
		id: "settings-members",
		label: "Members",
		href: "/settings/members",
		keywords: ["team", "people", "invite", "roles"],
	},
	{
		id: "settings-api-keys",
		label: "API Keys",
		href: "/settings/api-keys",
		keywords: ["tokens", "developers"],
	},
	{
		id: "settings-sso",
		label: "SSO",
		href: "/settings/sso",
		keywords: ["single sign-on", "saml", "okta", "identity provider"],
	},
];

function recordMedia(record: RecentRecord) {
	return record.kind === "contact" ? (
		<PersonAvatar src={record.imageUrl} name={record.label} size="sm" />
	) : (
		<EntityLogo
			src={record.iconUrl}
			darkSrc={record.iconDarkUrl}
			tone={record.iconTone}
			name={record.label}
			size="sm"
		/>
	);
}

function RecentRecordsRecovery({
	slug,
	raw,
}: {
	slug: string;
	raw: string | null;
}) {
	useMountEffect(() => recoverRecentRecords(slug, raw));
	return null;
}

export function QuickSwitcher() {
	const router = useRouter();
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const slug = useWorkspaceSlug();
	const workspaceUrl = useWorkspaceUrl();
	const recents = readRecentRecords(useRecentRecordsRaw(slug));

	const [open, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.switcher,
		parseAsBoolean.withDefault(false),
	);
	const [query, setQuery] = useState("");
	const [requested, setRequested] = useState("");
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useMountEffect(() => () => {
		if (timer.current) clearTimeout(timer.current);
	});

	const current = query.trim().slice(0, COMMAND_SEARCH.query.maxLength);
	const ready = current === requested;
	const searchable = current.length >= COMMAND_SEARCH.query.minLength;

	const workspace = useQuery({
		...trpc.workspace.get.queryOptions(),
		enabled: open,
	});

	const search = useQuery({
		...trpc.search.quick.queryOptions({ q: requested }),
		enabled: open && requested.length >= COMMAND_SEARCH.query.minLength,
	});

	const hits = ready && searchable ? (search.data?.hits ?? []) : [];

	const go = (href: string) => {
		void setOpen(null).then(() => router.push(workspaceUrl(href)));
	};

	const choose = (record: RecentRecord) => {
		openRecord({ kind: record.kind, id: record.id });
	};

	const chooseRecent = async (record: RecentRecord) => {
		try {
			const exists = await resolveRecentRecord(
				() => {
					switch (record.kind) {
						case "company":
							return queryClient.fetchQuery({
								...trpc.companies.byId.queryOptions({ id: record.id }),
								staleTime: 0,
							});
						case "contact":
							return queryClient.fetchQuery({
								...trpc.contacts.byId.queryOptions({ id: record.id }),
								staleTime: 0,
							});
						case "deal":
							return queryClient.fetchQuery({
								...trpc.deals.byId.queryOptions({ id: record.id }),
								staleTime: 0,
							});
					}
				},
				() => forgetRecentRecord(slug, record),
			);
			if (exists) choose(record);
			else
				toast.error(
					"This record no longer exists. It is removed from recent records.",
				);
		} catch {
			toast.error("This record cannot be opened. Try again.");
		}
	};

	const destination = (group: string, path?: string[]) => {
		return (entry: Destination): CommandSearchItem => ({
			id: entry.id,
			label: entry.label,
			group,
			icon: entry.icon,
			path,
			keywords: entry.keywords,
			onSelect: () => go(entry.href),
		});
	};

	const results: CommandSearchItem[] = KIND_ORDER.flatMap((kind) => {
		const group = hits.filter((hit) => hit.kind === kind);
		const records = group.map((hit): CommandSearchItem => {
			const tone = entityLogoTone.safeParse(hit.iconTone);
			const record: RecentRecord = {
				kind: hit.kind,
				id: hit.id,
				label: hit.label,
				detail: hit.detail,
				iconUrl: hit.iconUrl,
				iconDarkUrl: hit.iconDarkUrl,
				iconTone: tone.success ? tone.data : null,
				imageUrl: hit.imageUrl,
			};

			return {
				id: `${hit.kind}:${hit.id}`,
				label: hit.label,
				group: KINDS[kind].group,
				media: recordMedia(record),
				snippet: hit.detail ?? undefined,
				onSelect: () => choose(record),
			};
		});

		if (group.length < COMMAND_SEARCH.results.perKind) return records;

		const params = new URLSearchParams({ [SEARCH_PARAM.list.q]: current });

		return [
			...records,
			{
				id: `all:${kind}`,
				label: `All ${KINDS[kind].noun} matching “${current}”`,
				group: KINDS[kind].group,
				icon: SearchIcon,
				onSelect: () => go(`${KINDS[kind].list}?${params}`),
			},
		];
	});

	const items: CommandSearchItem[] = [
		...(query.trim() || recents.status === "invalid"
			? []
			: recents.records.map(
					(record): CommandSearchItem => ({
						id: `recent:${record.kind}:${record.id}`,
						label: record.label,
						group: "Recent",
						media: recordMedia(record),
						snippet: record.detail ?? undefined,
						onSelect: () => void chooseRecent(record),
					}),
				)),
		...PAGES.map(destination("Pages")),
		...CREATE.map(destination("Create")),
		...SETTINGS.map(destination("Settings", ["Settings", "Workspace"])),
	];

	return (
		<>
			{recents.status === "invalid" ? (
				<RecentRecordsRecovery
					key={recents.raw}
					slug={slug}
					raw={recents.raw}
				/>
			) : null}
			<CommandSearch
				open={open}
				onOpenChange={(next) => void setOpen(next || null)}
				items={items}
				results={results}
				workspaceName={workspace.data?.name.trim() || undefined}
				placeholder="Search companies, contacts, deals and pages…"
				description="Jump to a company, contact, deal, page or setting."
				onQueryChange={(value) => {
					setQuery(value);

					if (timer.current) clearTimeout(timer.current);
					const normalized = value
						.trim()
						.slice(0, COMMAND_SEARCH.query.maxLength);

					if (normalized.length < COMMAND_SEARCH.query.minLength) {
						setRequested("");
					} else {
						timer.current = setTimeout(
							() => setRequested(normalized),
							COMMAND_SEARCH.query.debounceMs,
						);
					}
				}}
				loading={searchable && (!ready || search.isPending)}
				searchError={
					ready && search.error
						? "Search failed. Pages still match."
						: undefined
				}
				onRetry={() => void search.refetch()}
			/>
		</>
	);
}
