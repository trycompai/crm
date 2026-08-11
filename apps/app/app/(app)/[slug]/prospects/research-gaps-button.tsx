"use client";

import Renew from "@carbon/icons-react/es/Renew";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ResearchGapsButton() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const research = useMutation(
		trpc.prospects.researchGaps.mutationOptions({
			onSuccess: async (result) => {
				await cache.prospect();
				toast.success(
					result.selected > 0
						? `${result.selected} prospect gaps queued for public research.`
						: "No unresolved research gaps were found.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Button
			variant="outline"
			disabled={research.isPending}
			onClick={() => research.mutate({ limit: 100 })}
		>
			<Icon icon={Renew} />
			{research.isPending ? "Queueing gaps" : "Research gaps"}
		</Button>
	);
}
