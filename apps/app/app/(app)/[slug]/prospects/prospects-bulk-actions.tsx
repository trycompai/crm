"use client";

import Renew from "@carbon/icons-react/es/Renew";
import {
	DropdownMenuGroup,
	DropdownMenuItem,
} from "@crm/ui/components/dropdown-menu";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BulkActionsMenu } from "@/components/crm/bulk-actions";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ProspectsBulkActions({
	ids,
	onDone,
}: {
	ids: string[];
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const research = useMutation(
		trpc.prospects.researchMany.mutationOptions({
			onSuccess: async (result) => {
				await cache.prospect();
				toast.success(
					`${result.queued} queued; ${result.alreadyQueued} already in progress.`,
				);
				onDone();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<BulkActionsMenu pending={research.isPending}>
			<DropdownMenuGroup>
				<DropdownMenuItem onSelect={() => research.mutate({ ids })}>
					<Renew />
					Refresh public research
				</DropdownMenuItem>
			</DropdownMenuGroup>
		</BulkActionsMenu>
	);
}
