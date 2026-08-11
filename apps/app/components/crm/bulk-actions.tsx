"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Spinner } from "@crm/ui/components/spinner";
import type { ReactNode } from "react";
import { toast } from "sonner";

export type BulkResult = {
	requested: number;
	succeeded: number;
	failed: number;
	message: string | null;
};

export function reportBulk(
	result: BulkResult,
	done: (count: number) => string,
): void {
	if (result.succeeded === 0) {
		toast.error(result.message ?? "Nothing changed.");
		return;
	}

	if (result.failed > 0) {
		toast.error(
			`${done(result.succeeded)} ${result.failed} ${
				result.failed === 1 ? "was" : "were"
			} left alone${result.message ? ` — ${result.message}` : "."}`,
		);
		return;
	}

	toast.success(done(result.succeeded));
}

export function BulkActionsMenu({
	pending,
	open,
	onOpenChange,
	children,
}: {
	pending?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children: ReactNode;
}) {
	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" disabled={pending}>
					{pending ? <Spinner /> : null}
					Actions
					<ChevronDown data-icon="inline-end" className="opacity-60" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-52">
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function BulkOwnerMenu({
	users,
	onSelect,
	unassignedLabel,
}: {
	users: { id: string; name: string }[];
	onSelect: (ownerId: string | null) => void;
	unassignedLabel?: string;
}) {
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>Assign owner</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="max-h-72 overflow-y-auto">
				<DropdownMenuGroup>
					{unassignedLabel && (
						<DropdownMenuItem onSelect={() => onSelect(null)}>
							{unassignedLabel}
						</DropdownMenuItem>
					)}
					{users.length === 0 ? (
						<DropdownMenuLabel>Nobody else works here yet.</DropdownMenuLabel>
					) : (
						users.map((user) => (
							<DropdownMenuItem
								key={user.id}
								onSelect={() => onSelect(user.id)}
							>
								{user.name}
							</DropdownMenuItem>
						))
					)}
				</DropdownMenuGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export function BulkDeleteDialog({
	open,
	onOpenChange,
	title,
	description,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onConfirm}>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
