"use client";

import Renew from "@carbon/icons-react/es/Renew";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { useMutation } from "@tanstack/react-query";
import type { ComponentProps, MouseEvent } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ProspectResearchButton({
	id,
	queued,
	label = "Research now",
	size = "sm",
	variant = "outline",
}: {
	id: string;
	queued: boolean;
	label?: string;
	size?: ComponentProps<typeof Button>["size"];
	variant?: ComponentProps<typeof Button>["variant"];
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const research = useMutation(
		trpc.prospects.research.mutationOptions({
			onSuccess: async (result) => {
				await cache.prospect(id);
				toast.success(
					result.queued > 0
						? "Public research queued."
						: "Research is already in progress.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const run = (event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		research.mutate({ id });
	};

	return (
		<Button
			variant={variant}
			size={size}
			disabled={research.isPending || queued}
			onClick={run}
		>
			<Icon icon={Renew} data-icon="inline-start" />
			{queued ? "Researching" : research.isPending ? "Queueing" : label}
		</Button>
	);
}
