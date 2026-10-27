"use client";

import { useAppShellNav } from "@crm/ui/components/app-shell";
import {
	AppSidebar,
	AppSidebarGroup,
	AppSidebarItem,
	AppSidebarSection,
	AppSidebarSkeleton,
	AppSidebarWorkspace,
} from "@crm/ui/components/app-sidebar";
import { DropdownMenuItem } from "@crm/ui/components/dropdown-menu";
import { WorkspaceSwitcher } from "@crm/ui/components/workspace-switcher";
import { useQuery } from "@tanstack/react-query";
import {
	Building2Icon,
	HandshakeIcon,
	LayoutDashboardIcon,
	ListChecksIcon,
	type LucideIcon,
	MessagesSquareIcon,
	SettingsIcon,
	UserPlusIcon,
	UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AgentChatNav } from "@/components/agent-builder/agent-builder-sidebar";
import { usePrefetchSection } from "@/components/crm/section-prefetch";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type NavItem = {
	title: string;
	href: string;
	icon: LucideIcon;
	match: "exact" | "prefix";
	related?: string[];
};

type WorkspaceData = {
	id: string;
	slug: string;
	name: string;
	website: string | null;
	onboarded: boolean;
	viewerRole: "owner" | "member" | "admin" | null;
	canRename: boolean;
	canChangeRoles: boolean;
};

const PRIMARY: NavItem[] = [
	{ title: "Overview", href: "/", icon: LayoutDashboardIcon, match: "exact" },
	{
		title: "Chat",
		href: "/chat",
		icon: MessagesSquareIcon,
		match: "prefix",
		related: ["/agents"],
	},
	{
		title: "Companies",
		href: "/companies",
		icon: Building2Icon,
		match: "prefix",
	},
	{ title: "Contacts", href: "/contacts", icon: UsersIcon, match: "prefix" },
	{ title: "Deals", href: "/deals", icon: HandshakeIcon, match: "prefix" },
	{ title: "Tasks", href: "/tasks", icon: ListChecksIcon, match: "prefix" },
];

const SETTINGS: NavItem = {
	title: "Settings",
	href: "/settings",
	icon: SettingsIcon,
	match: "prefix",
};

const SETTINGS_PAGES: { title: string; href: string }[] = [
	{ title: "General", href: "/settings" },
	{ title: "Tracking & Analytics", href: "/settings/tracking" },
	{ title: "Connections", href: "/settings/connections" },
	{ title: "Currencies", href: "/settings/currencies" },
	{ title: "Members", href: "/settings/members" },
	{ title: "API Keys", href: "/settings/api-keys" },
	{ title: "SSO", href: "/settings/sso" },
];

const WORKSPACE_ACTIONS: { title: string; href: string; icon: LucideIcon }[] = [
	{ title: "Workspace settings", href: "/settings", icon: SettingsIcon },
	{ title: "Members", href: "/settings/members", icon: UserPlusIcon },
];

function startsWithSegment(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

function isActive(item: NavItem, pathname: string): boolean {
	return (
		pathname === item.href ||
		(item.match === "prefix" && startsWithSegment(pathname, item.href)) ||
		Boolean(item.related?.some((prefix) => startsWithSegment(pathname, prefix)))
	);
}

function WorkspaceHeader({
	initialWorkspace,
}: {
	initialWorkspace?: WorkspaceData;
}) {
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const nav = useAppShellNav();
	const workspace = useQuery({
		...trpc.workspace.get.queryOptions(),
		initialData: initialWorkspace,
	});

	if (!workspace.data) {
		return (
			<AppSidebarWorkspace name="Workspace" loading={workspace.isPending} />
		);
	}

	const { id, slug, name } = workspace.data;

	return (
		<WorkspaceSwitcher
			workspaces={[{ id, slug, name: name.trim() || "Workspace", logo: null }]}
			activeSlug={slug}
			onSwitch={() => {
				nav.close();
				router.push(workspaceUrl());
			}}
			label="Workspace"
			actions={WORKSPACE_ACTIONS.map((action) => (
				<DropdownMenuItem key={action.href} asChild onSelect={nav.close}>
					<Link href={workspaceUrl(action.href)}>
						<action.icon aria-hidden />
						{action.title}
					</Link>
				</DropdownMenuItem>
			))}
		/>
	);
}

export function WorkspaceNav({
	initialWorkspace,
}: {
	initialWorkspace?: WorkspaceData;
}) {
	const pathname = usePathname();
	const workspaceUrl = useWorkspaceUrl();
	const prefetchSection = usePrefetchSection();

	const resolve = (item: NavItem): NavItem => ({
		...item,
		href: workspaceUrl(item.href),
		related: item.related?.map((path) => workspaceUrl(path)),
	});

	const settings = resolve(SETTINGS);

	if (startsWithSegment(pathname, settings.href)) {
		return (
			<AppSidebar
				label="Workspace settings"
				header={<WorkspaceHeader initialWorkspace={initialWorkspace} />}
			>
				<AppSidebarSection
					label="Settings"
					back={<Link href={workspaceUrl()} transitionTypes={["nav-back"]} />}
				>
					<AppSidebarGroup>
						{SETTINGS_PAGES.map((page) => {
							const href = workspaceUrl(page.href);
							const active =
								page.href === SETTINGS.href
									? pathname === href
									: startsWithSegment(pathname, href);
							return (
								<AppSidebarItem
									key={page.href}
									label={page.title}
									active={active}
									inset
								>
									<Link
										href={href}
										prefetch
										transitionTypes={["nav-lateral"]}
									/>
								</AppSidebarItem>
							);
						})}
					</AppSidebarGroup>
				</AppSidebarSection>
			</AppSidebar>
		);
	}

	const items = PRIMARY.map(resolve);
	const chat = items.find((item) => item.href === workspaceUrl("/chat"));

	if (chat && isActive(chat, pathname)) {
		return (
			<AppSidebar
				label="Chats"
				header={<WorkspaceHeader initialWorkspace={initialWorkspace} />}
			>
				<AgentChatNav />
			</AppSidebar>
		);
	}

	const link = (item: NavItem, section: string) => (
		<AppSidebarItem
			key={item.href}
			icon={item.icon}
			label={item.title}
			active={isActive(item, pathname)}
		>
			<Link
				href={item.href}
				prefetch
				onMouseEnter={() => prefetchSection(section)}
				onFocus={() => prefetchSection(section)}
				transitionTypes={["nav-lateral"]}
			/>
		</AppSidebarItem>
	);

	return (
		<AppSidebar
			label="Primary"
			header={<WorkspaceHeader initialWorkspace={initialWorkspace} />}
			footer={link(settings, SETTINGS.href)}
		>
			<AppSidebarGroup>
				{items.map((item, index) => link(item, PRIMARY[index]?.href ?? "/"))}
			</AppSidebarGroup>
		</AppSidebar>
	);
}

export function WorkspaceNavFallback() {
	return (
		<AppSidebar label="Primary" header={<AppSidebarWorkspace loading />}>
			<AppSidebarSkeleton rows={PRIMARY.length} />
		</AppSidebar>
	);
}
