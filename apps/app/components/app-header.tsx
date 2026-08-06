"use client";

import Asleep from "@carbon/icons-react/es/Asleep";
import Light from "@carbon/icons-react/es/Light";
import Logout from "@carbon/icons-react/es/Logout";
import Menu from "@carbon/icons-react/es/Menu";
import UserAvatar from "@carbon/icons-react/es/UserAvatar";
import { Avatar, AvatarFallback, AvatarImage } from "@crm/ui/components/avatar";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import Logo from "@crm/ui/components/logo";
import { Separator } from "@crm/ui/components/separator";
import { Skeleton } from "@crm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useMobileNav } from "@/components/mobile-nav";
import { signOutAndRedirect } from "@/lib/sign-out";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { workspaceLabel } from "@/lib/workspace-label";

type User = { name: string; email: string; image: string | null };

export function AppHeader({ user }: { user: User }) {
	const { setOpen: setMobileNavOpen } = useMobileNav();
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const label = workspaceLabel(workspace.data?.name);

	return (
		<header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 [view-transition-name:app-header]">
			<div className="flex shrink-0 items-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					className="md:hidden"
					aria-label="Open navigation"
					onClick={() => setMobileNavOpen(true)}
				>
					<Menu />
				</Button>
				<Link
					href={workspaceUrl()}
					aria-label="Homepage"
					className="hidden size-8 items-center justify-center text-foreground md:flex"
				>
					<Logo className="size-5" />
				</Link>
				<Separator orientation="vertical" className="mx-1 h-5 bg-transparent" />
				<span className="min-w-0 truncate font-medium text-sm">{label}</span>
			</div>

			<div className="ml-auto flex shrink-0 items-center gap-1.5">
				<UserMenu
					user={user}
					onSignOut={() => {
						signOutAndRedirect().catch(() =>
							toast.error("Could not sign out."),
						);
					}}
				/>
			</div>
		</header>
	);
}

export function AppHeaderFallback() {
	return (
		<header
			className="flex h-12 shrink-0 items-center gap-2 border-b px-3 [view-transition-name:app-header]"
			aria-busy="true"
		>
			<div className="flex shrink-0 items-center gap-1">
				<span className="hidden size-8 items-center justify-center text-foreground md:flex">
					<Logo className="size-5" />
				</span>
				<Separator orientation="vertical" className="mx-1 h-5 bg-transparent" />
				<Skeleton className="h-4 w-24" />
			</div>

			<div className="ml-auto flex shrink-0 items-center gap-1.5">
				<Avatar className="size-7">
					<AvatarFallback />
				</Avatar>
			</div>
			<span role="status" className="sr-only">
				Loading workspace header…
			</span>
		</header>
	);
}

function UserMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
	const { resolvedTheme, setTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Account menu"
					className="hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent"
				>
					<Avatar className="size-7">
						{user.image && <AvatarImage alt={user.name} src={user.image} />}
						<AvatarFallback className="text-xs">
							{initials(user.name)}
						</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-56">
				<DropdownMenuLabel className="flex items-center gap-2">
					<UserAvatar />
					<span className="min-w-0 truncate">{user.email}</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={(event) => {
						event.preventDefault();
						setTheme(isDark ? "light" : "dark");
					}}
				>
					{isDark ? <Light /> : <Asleep />}
					{isDark ? "Light mode" : "Dark mode"}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onSignOut}>
					<Logout />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function initials(name: string): string {
	return (
		name
			.split(" ")
			.map((part) => part[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?"
	);
}
