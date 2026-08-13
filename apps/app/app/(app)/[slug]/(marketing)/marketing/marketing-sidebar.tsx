"use client";

import { Button } from "@crm/ui/components/button";
import { cn } from "@crm/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type MarketingNavItem = {
	title: string;
	href: string;
};

const ROOT = "/marketing";

const ITEMS: MarketingNavItem[] = [
	{ title: "Overview", href: ROOT },
	{ title: "Campaigns", href: `${ROOT}/campaigns` },
	{ title: "Templates", href: `${ROOT}/templates` },
	{ title: "Segments", href: `${ROOT}/segments` },
	{ title: "Settings", href: `${ROOT}/settings` },
];

function isActive(href: string, root: string, pathname: string): boolean {
	return href === root ? pathname === href : pathname.startsWith(href);
}

function NavLink({
	item,
	active,
	className,
}: {
	item: MarketingNavItem;
	active: boolean;
	className: string;
}) {
	return (
		<Button
			asChild
			variant="ghost"
			className={cn(
				"justify-start font-normal text-muted-foreground",
				active &&
					"bg-muted text-foreground hover:bg-muted hover:text-foreground",
				className,
			)}
		>
			<Link
				href={item.href}
				prefetch
				aria-current={active ? "page" : undefined}
				transitionTypes={["nav-lateral"]}
			>
				{item.title}
			</Link>
		</Button>
	);
}

export function MarketingSidebarFallback() {
	return (
		<aside className="hidden w-56 shrink-0 border-r md:block [view-transition-name:marketing-sidebar]">
			<nav
				aria-label="Marketing"
				aria-busy="true"
				className="flex flex-col gap-0.5 p-3"
			>
				{ITEMS.map((item) => (
					<Button
						key={item.href}
						variant="ghost"
						disabled
						className="w-full justify-start px-3 font-normal text-muted-foreground"
					>
						{item.title}
					</Button>
				))}
			</nav>
		</aside>
	);
}

export function MarketingSidebar() {
	const pathname = usePathname();
	const workspaceUrl = useWorkspaceUrl();

	const root = workspaceUrl(ROOT);
	const items = useMemo(
		() => ITEMS.map((item) => ({ ...item, href: workspaceUrl(item.href) })),
		[workspaceUrl],
	);

	return (
		<>
			<aside className="hidden w-56 shrink-0 border-r md:block [view-transition-name:marketing-sidebar]">
				<nav aria-label="Marketing" className="flex flex-col gap-0.5 p-3">
					{items.map((item) => (
						<NavLink
							key={item.href}
							item={item}
							active={isActive(item.href, root, pathname)}
							className="w-full px-3"
						/>
					))}
				</nav>
			</aside>

			<nav
				aria-label="Marketing"
				className="flex gap-1 overflow-x-auto border-b p-2 md:hidden [view-transition-name:marketing-sidebar]"
			>
				{items.map((item) => (
					<NavLink
						key={item.href}
						item={item}
						active={isActive(item.href, root, pathname)}
						className="shrink-0 px-3"
					/>
				))}
			</nav>
		</>
	);
}
