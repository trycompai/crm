"use client";

import Renew from "@carbon/icons-react/es/Renew";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@crm/ui/components/dropdown-menu";
import { formatCount } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	BulkActionsMenu,
	BulkDeleteDialog,
	BulkOwnerMenu,
	reportBulk,
} from "@/components/crm/bulk-actions";
import { CompanyMenuSearch } from "@/components/crm/company-picker";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

function contacts(count: number): string {
	return formatCount(count, "contact");
}

export function ContactsBulkActions({
	ids,
	onDone,
}: {
	ids: string[];
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const users = useQuery(trpc.users.list.queryOptions());
	const [confirming, setConfirming] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const companySearch = useRef<HTMLInputElement>(null);

	const onError = (error: { message: string }) => toast.error(error.message);

	const assignOwner = useMutation(
		trpc.contacts.bulkAssignOwner.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(result, (count) => `${contacts(count)} reassigned.`);
				onDone();
			},
			onError,
		}),
	);

	const setCompany = useMutation(
		trpc.contacts.bulkSetCompany.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(result, (count) => `${contacts(count)} moved.`);
				onDone();
			},
			onError,
		}),
	);

	const enrich = useMutation(
		trpc.contacts.bulkEnrich.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(
					result,
					(count) => `Looking up ${contacts(count)} — the table will update.`,
				);
				onDone();
			},
			onError,
		}),
	);

	const remove = useMutation(
		trpc.contacts.bulkDelete.mutationOptions({
			onSuccess: async (result, variables) => {
				await cache.removedMany({ kind: "contact", ids: variables.ids });
				reportBulk(result, (count) => `${contacts(count)} deleted.`);
				setConfirming(false);
				onDone();
			},
			onError,
		}),
	);

	const pending =
		assignOwner.isPending ||
		setCompany.isPending ||
		enrich.isPending ||
		remove.isPending;

	return (
		<>
			<BulkActionsMenu
				pending={pending}
				open={menuOpen}
				onOpenChange={setMenuOpen}
			>
				<BulkOwnerMenu
					users={users.data ?? []}
					unassignedLabel="Nobody"
					onSelect={(ownerId) => assignOwner.mutate({ ids, ownerId })}
				/>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>Move to company</DropdownMenuSubTrigger>
					<DropdownMenuSubContent
						className="w-64 p-0"
						onFocus={(event) => {
							if (event.target === event.currentTarget) {
								companySearch.current?.focus();
							}
						}}
					>
						<CompanyMenuSearch
							none="No company"
							inputRef={companySearch}
							onSelect={(companyId) => {
								setMenuOpen(false);
								setCompany.mutate({ ids, companyId });
							}}
						/>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuGroup>
					<DropdownMenuItem onSelect={() => enrich.mutate({ ids })}>
						<Renew />
						Re-enrich
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => setConfirming(true)}
					>
						<TrashCan />
						Delete
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</BulkActionsMenu>

			<BulkDeleteDialog
				open={confirming}
				onOpenChange={setConfirming}
				title={`Delete ${contacts(ids.length)}?`}
				description="Their email addresses are suppressed, so the inbox sync will not file them again. This cannot be undone."
				onConfirm={() => remove.mutate({ ids })}
			/>
		</>
	);
}
