"use client";

import { Button } from "@crm/ui/components/button";
import { cn } from "@crm/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

type SettingsNavItem = {
	title: string;
	href: string;
};

const ROOT = "/settings";

const ITEMS: SettingsNavItem[] = [
	{ title: "General", href: ROOT },
	{ title: "Members", href: `${ROOT}/members` },
	{ title: "SSO", href: `${ROOT}/sso` },
	{ title: "Connections", href: `${ROOT}/connections` },
];

function isActive(href: string, pathname: string): boolean {
	return href === ROOT ? pathname === href : pathname.startsWith(href);
}

function NavLink({
	item,
	active,
	className,
}: {
	item: SettingsNavItem;
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
				aria-current={active ? "page" : undefined}
				transitionTypes={["nav-lateral"]}
			>
				{item.title}
			</Link>
		</Button>
	);
}

export function SettingsSidebar() {
	const pathname = usePathname();

	return (
		<>
			<aside className="hidden w-56 shrink-0 border-r md:block [view-transition-name:settings-sidebar]">
				<nav
					aria-label="Workspace settings"
					className="flex flex-col gap-0.5 p-3"
				>
					{ITEMS.map((item) => (
						<NavLink
							key={item.href}
							item={item}
							active={isActive(item.href, pathname)}
							className="w-full px-3"
						/>
					))}
				</nav>
			</aside>

			<nav
				aria-label="Workspace settings"
				className="flex gap-1 overflow-x-auto border-b p-2 md:hidden [view-transition-name:settings-sidebar]"
			>
				{ITEMS.map((item) => (
					<NavLink
						key={item.href}
						item={item}
						active={isActive(item.href, pathname)}
						className="shrink-0 px-3"
					/>
				))}
			</nav>
		</>
	);
}
