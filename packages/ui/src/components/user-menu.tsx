"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@crm/ui/components/avatar";
import { GeneratedAvatar } from "@crm/ui/components/generated-avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Skeleton } from "@crm/ui/components/skeleton";
import { LogOutIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { type ReactNode, useTransition } from "react";

export type UserMenuUser = {
	name: string;
	email: string;
	avatar: string | null;
};

export type ThemePreference = "light" | "dark" | "system";

const THEMES = [
	{ value: "light", label: "Light", icon: SunIcon },
	{ value: "dark", label: "Dark", icon: MoonIcon },
	{ value: "system", label: "System", icon: MonitorIcon },
] as const;

function isThemePreference(value: string): value is ThemePreference {
	return THEMES.some((theme) => theme.value === value);
}

function UserAvatar({
	user,
	trigger = false,
}: {
	user: UserMenuUser;
	trigger?: boolean;
}) {
	return (
		<Avatar className={trigger ? "size-7" : undefined}>
			{user.avatar ? <AvatarImage alt={user.name} src={user.avatar} /> : null}
			<AvatarFallback>
				<GeneratedAvatar seed={user.email || user.name} size="fill" />
			</AvatarFallback>
		</Avatar>
	);
}

function ThemeSwitcher({
	value,
	onValueChange,
	label,
}: {
	value: ThemePreference;
	onValueChange: (theme: ThemePreference) => void;
	label: string;
}) {
	return (
		<DropdownMenuPrimitive.RadioGroup
			aria-label={label}
			className="flex rounded-md shadow-xs"
			data-slot="theme-switcher"
			onValueChange={(next) => {
				if (isThemePreference(next)) onValueChange(next);
			}}
			value={value}
		>
			{THEMES.map(({ value: theme, label: themeLabel, icon: ThemeIcon }) => (
				<DropdownMenuPrimitive.RadioItem
					aria-label={themeLabel}
					className="relative -ml-px flex h-8 min-w-8 cursor-default items-center justify-center border border-border px-2 text-foreground outline-none transition-[color,background-color,box-shadow] first:ml-0 first:rounded-l-md last:rounded-r-md hover:bg-muted focus-visible:z-10 focus-visible:shadow-focus data-[state=checked]:bg-muted [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
					key={theme}
					onSelect={(event) => event.preventDefault()}
					value={theme}
				>
					<ThemeIcon aria-hidden />
				</DropdownMenuPrimitive.RadioItem>
			))}
		</DropdownMenuPrimitive.RadioGroup>
	);
}

function UserMenu({
	user,
	actions,
	theme,
	onThemeChange,
	onSignOut,
	menuLabel = "Account menu",
	themeLabel = "Theme",
	signOutLabel = "Log out",
}: {
	user: UserMenuUser;
	actions?: ReactNode;
	theme: ThemePreference;
	onThemeChange: (theme: ThemePreference) => void;
	onSignOut: () => Promise<void>;
	menuLabel?: string;
	themeLabel?: string;
	signOutLabel?: string;
}) {
	const [isSigningOut, startSignOut] = useTransition();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={menuLabel}
				className="flex shrink-0 rounded-full outline-none focus-visible:shadow-focus"
			>
				<UserAvatar trigger user={user} />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="min-w-60"
				side="bottom"
				sideOffset={4}
			>
				<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
					<UserAvatar user={user} />
					<div className="grid min-w-0 flex-1 leading-tight">
						<span className="truncate font-medium">{user.name}</span>
						<span className="truncate text-muted-foreground text-xs">
							{user.email}
						</span>
					</div>
				</div>
				<DropdownMenuSeparator />
				{actions ? <DropdownMenuGroup>{actions}</DropdownMenuGroup> : null}
				<div className="flex items-center justify-between gap-4 py-1 pr-1 pl-2 text-sm">
					<span className="text-muted-foreground">{themeLabel}</span>
					<ThemeSwitcher
						label={themeLabel}
						onValueChange={onThemeChange}
						value={theme}
					/>
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					disabled={isSigningOut}
					onSelect={(event) => {
						event.preventDefault();
						startSignOut(onSignOut);
					}}
				>
					<LogOutIcon aria-hidden />
					{signOutLabel}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function UserMenuSkeleton() {
	return <Skeleton className="size-7 shrink-0 rounded-full" />;
}

export { UserMenu, UserMenuSkeleton };
