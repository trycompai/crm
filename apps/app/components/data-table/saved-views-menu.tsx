"use client";

import Bookmark from "@carbon/icons-react/es/Bookmark";
import Close from "@carbon/icons-react/es/Close";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { FieldEntity } from "@/components/crm/fields/fields-entity";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import type { TableQuery } from "./use-table-query";

type SavedView = RouterOutputs["savedViews"]["list"][number];

const RECORD_KIND = {
	COMPANY: "company",
	CONTACT: "contact",
	DEAL: "deal",
} as const satisfies Record<FieldEntity, "company" | "contact" | "deal">;

export function SavedViewsMenu({
	entity,
	table,
}: {
	entity: FieldEntity;
	table: Pick<TableQuery<string, string>, "currentView" | "applyView">;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const views = useQuery(trpc.savedViews.list.queryOptions({ entity }));

	const [dialogOpen, setDialogOpen] = useState(false);
	const [name, setName] = useState("");
	const [shared, setShared] = useState(false);

	const closeDialog = () => {
		setDialogOpen(false);
		setName("");
		setShared(false);
	};

	const settle = () => cache.savedViews(RECORD_KIND[entity]);

	const create = useMutation(
		trpc.savedViews.create.mutationOptions({
			onSuccess: async () => {
				await settle();
				toast.success("View saved.");
				closeDialog();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const remove = useMutation(
		trpc.savedViews.delete.mutationOptions({
			onSuccess: async () => {
				await settle();
				toast.success("View deleted.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const list = views.data ?? [];
	const mine = list.filter((view) => view.mine);
	const shared_ = list.filter((view) => !view.mine);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="justify-start sm:justify-center"
					>
						<Bookmark data-icon="inline-start" />
						Views
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-56">
					<DropdownMenuItem onSelect={() => setDialogOpen(true)}>
						Save current view…
					</DropdownMenuItem>
					{list.length > 0 && <DropdownMenuSeparator />}
					{mine.length > 0 && <DropdownMenuLabel>My views</DropdownMenuLabel>}
					{mine.map((view) => (
						<ViewItem
							key={view.id}
							view={view}
							onApply={() => table.applyView(view.filters)}
							onDelete={() => remove.mutate({ id: view.id })}
						/>
					))}
					{shared_.length > 0 && (
						<DropdownMenuLabel>Shared with the team</DropdownMenuLabel>
					)}
					{shared_.map((view) => (
						<DropdownMenuItem
							key={view.id}
							onSelect={() => table.applyView(view.filters)}
						>
							<span className="truncate">{view.name}</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog
				open={dialogOpen}
				onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Save this view</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-4">
						<Field>
							<FieldLabel htmlFor="saved-view-name">Name</FieldLabel>
							<Input
								id="saved-view-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								autoFocus
							/>
						</Field>
						<Field orientation="horizontal">
							<FieldLabel htmlFor="saved-view-shared">
								Share with the team
							</FieldLabel>
							<Switch
								id="saved-view-shared"
								checked={shared}
								onCheckedChange={setShared}
							/>
						</Field>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={closeDialog}>
							Cancel
						</Button>
						<Button
							disabled={name.trim() === "" || create.isPending}
							onClick={() =>
								create.mutate({
									entity,
									name: name.trim(),
									shared,
									filters: table.currentView,
								})
							}
						>
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function ViewItem({
	view,
	onApply,
	onDelete,
}: {
	view: SavedView;
	onApply: () => void;
	onDelete: () => void;
}) {
	return (
		<div className="flex items-center gap-1">
			<DropdownMenuItem className="min-w-0 flex-1" onSelect={onApply}>
				<span className="truncate">{view.name}</span>
			</DropdownMenuItem>
			<DropdownMenuItem
				variant="destructive"
				className="shrink-0"
				onSelect={onDelete}
			>
				<Close />
				<span className="sr-only">Delete {view.name}</span>
			</DropdownMenuItem>
		</div>
	);
}
