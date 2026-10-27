"use client";

import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { EntityLogo } from "@crm/ui/components/entity-logo";
import { GeneratedAvatar } from "@crm/ui/components/generated-avatar";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { INTERACTION_CONFIG } from "@crm/ui/lib/interaction-config";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { type ReactNode, useEffectEvent } from "react";

export type SwitcherWorkspace = {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
};

function WorkspaceLogo({
	workspace,
	size = "default",
}: {
	workspace: SwitcherWorkspace;
	size?: "sm" | "default";
}) {
	if (workspace.logo?.trim()) {
		return (
			<EntityLogo name={workspace.name} size={size} src={workspace.logo} />
		);
	}

	return (
		<GeneratedAvatar
			kind="workspace"
			seed={workspace.name}
			size={size === "sm" ? "sm" : "md"}
		/>
	);
}

function WorkspaceSwitcher({
	workspaces,
	activeSlug,
	onSwitch,
	actions,
	label = "Workspaces",
}: {
	workspaces: SwitcherWorkspace[];
	activeSlug: string | null;
	onSwitch: (slug: string) => void;
	actions?: ReactNode;
	label?: string;
}) {
	const onShortcut = useEffectEvent((event: KeyboardEvent) => {
		if (!event.metaKey && !event.ctrlKey) return;
		if (event.altKey || event.shiftKey) return;

		const position = Number.parseInt(event.key, 10);

		if (Number.isNaN(position) || position < 1) return;
		if (position > INTERACTION_CONFIG.workspaceShortcuts) return;

		const workspace = workspaces[position - 1];

		if (!workspace) return;

		event.preventDefault();
		onSwitch(workspace.slug);
	});

	useMountEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => onShortcut(event);

		window.addEventListener("keydown", onKeyDown);

		return () => window.removeEventListener("keydown", onKeyDown);
	});

	const activeWorkspace =
		workspaces.find((workspace) => workspace.slug === activeSlug) ??
		workspaces[0];

	if (!activeWorkspace) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					data-slot="workspace-switcher"
					className="h-10 w-full justify-start gap-2 px-2"
					variant="ghost"
				>
					<span aria-hidden className="flex shrink-0">
						<WorkspaceLogo size="sm" workspace={activeWorkspace} />
					</span>
					<span className="min-w-0 flex-1 truncate text-left font-medium text-sm">
						{activeWorkspace.name}
					</span>
					<ChevronsUpDownIcon aria-hidden className="text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
				sideOffset={4}
			>
				<DropdownMenuGroup>
					<DropdownMenuLabel>{label}</DropdownMenuLabel>
					{workspaces.map((workspace, index) => (
						<DropdownMenuItem
							aria-current={
								workspace.slug === activeWorkspace.slug ? "true" : undefined
							}
							key={workspace.id}
							onSelect={() => onSwitch(workspace.slug)}
						>
							<span aria-hidden className="flex shrink-0">
								<WorkspaceLogo workspace={workspace} />
							</span>
							<span className="min-w-0 flex-1 truncate">{workspace.name}</span>
							{workspace.slug === activeWorkspace.slug ? (
								<CheckIcon aria-hidden className="text-foreground" />
							) : null}
							{index < INTERACTION_CONFIG.workspaceShortcuts ? (
								<DropdownMenuShortcut className="ml-0">
									⌘{index + 1}
								</DropdownMenuShortcut>
							) : null}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
				{actions ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>{actions}</DropdownMenuGroup>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { WorkspaceSwitcher };
