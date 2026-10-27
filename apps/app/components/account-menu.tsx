"use client";

import { DropdownMenuItem } from "@crm/ui/components/dropdown-menu";
import { UserMenu, UserMenuSkeleton } from "@crm/ui/components/user-menu";
import { SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { signOutAndRedirect } from "@/lib/sign-out";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export type AccountUser = { name: string; email: string; image: string | null };

export function AccountMenu({ user }: { user: AccountUser }) {
	const { theme, setTheme } = useTheme();
	const workspaceUrl = useWorkspaceUrl();

	return (
		<UserMenu
			user={{ name: user.name, email: user.email, avatar: user.image }}
			theme={theme === "light" || theme === "dark" ? theme : "system"}
			onThemeChange={setTheme}
			onSignOut={() =>
				signOutAndRedirect().catch(() => {
					toast.error("Could not sign out.");
				})
			}
			actions={
				<DropdownMenuItem asChild>
					<Link href={workspaceUrl("/settings")}>
						<SettingsIcon aria-hidden />
						Settings
					</Link>
				</DropdownMenuItem>
			}
		/>
	);
}

export function AccountMenuFallback() {
	return <UserMenuSkeleton />;
}
