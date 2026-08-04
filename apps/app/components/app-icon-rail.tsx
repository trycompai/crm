"use client";

import Building from "@carbon/icons-react/es/Building";
import Bullhorn from "@carbon/icons-react/es/Bullhorn";
import type { CarbonIconType } from "@carbon/icons-react/es/CarbonIcon";
import Dashboard from "@carbon/icons-react/es/Dashboard";
import Partnership from "@carbon/icons-react/es/Partnership";
import Settings from "@carbon/icons-react/es/Settings";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { cn } from "@crm/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMobileNav } from "@/components/mobile-nav";

type RailItem = {
	title: string;
	href: string;
	icon: CarbonIconType;
	match: "exact" | "prefix";
};

const ITEMS: RailItem[] = [
	{ title: "Overview", href: "/", icon: Dashboard, match: "exact" },
	{ title: "Companies", href: "/companies", icon: Building, match: "prefix" },
	{
		title: "Contacts",
		href: "/contacts",
		icon: UserMultiple,
		match: "prefix",
	},
	{ title: "Deals", href: "/deals", icon: Partnership, match: "prefix" },
	{
		title: "Prospecting",
		href: "/prospecting",
		icon: Bullhorn,
		match: "prefix",
	},
	{ title: "Settings", href: "/settings", icon: Settings, match: "prefix" },
];

function isActive(item: RailItem, pathname: string): boolean {
	return (
		pathname === item.href ||
		(item.match === "prefix" && pathname.startsWith(item.href))
	);
}

function RailLink({ item, active }: { item: RailItem; active: boolean }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					asChild
					variant="ghost"
					size="icon"
					className={cn(
						"text-muted-foreground",
						active &&
							"bg-muted text-foreground hover:bg-muted hover:text-foreground",
					)}
				>
					<Link
						href={item.href}
						aria-current={active ? "page" : undefined}
						transitionTypes={["nav-lateral"]}
					>
						<Icon icon={item.icon} />
						<span className="sr-only">{item.title}</span>
					</Link>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="right">{item.title}</TooltipContent>
		</Tooltip>
	);
}

function MobileRailLink({
	item,
	active,
	onNavigate,
}: {
	item: RailItem;
	active: boolean;
	onNavigate: () => void;
}) {
	return (
		<Button
			asChild
			variant="ghost"
			className={cn(
				"justify-start gap-3 text-muted-foreground",
				active &&
					"bg-muted text-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			<Link
				href={item.href}
				aria-current={active ? "page" : undefined}
				onClick={onNavigate}
			>
				<Icon icon={item.icon} />
				<span>{item.title}</span>
			</Link>
		</Button>
	);
}

export function AppIconRail() {
	const pathname = usePathname();
	const { open, setOpen } = useMobileNav();

	return (
		<>
			<nav
				aria-label="Primary"
				className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r py-3 md:flex [view-transition-name:app-rail]"
			>
				{ITEMS.map((item) => (
					<RailLink
						key={item.href}
						item={item}
						active={isActive(item, pathname)}
					/>
				))}
			</nav>

			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent side="left" className="w-64 gap-0 p-0">
					<SheetHeader>
						<SheetTitle>Navigation</SheetTitle>
					</SheetHeader>
					<nav aria-label="Primary" className="flex flex-1 flex-col gap-1 p-2">
						{ITEMS.map((item) => (
							<MobileRailLink
								key={item.href}
								item={item}
								active={isActive(item, pathname)}
								onNavigate={() => setOpen(false)}
							/>
						))}
					</nav>
				</SheetContent>
			</Sheet>
		</>
	);
}
