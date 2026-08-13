"use client";

import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function SaveAsTemplate({
	nodeId,
	disabled,
}: {
	nodeId: string | null;
	disabled?: boolean;
}) {
	const trpc = useTRPC();

	const save = useMutation(
		trpc.marketingCampaigns.saveNodeAsTemplate.mutationOptions({
			onSuccess: () =>
				toast.success("Saved to Templates. It is a copy, not a link."),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={!nodeId || disabled || save.isPending}
			onClick={() => nodeId && save.mutate({ id: nodeId })}
		>
			{save.isPending ? <Spinner /> : null}
			Save as a template
		</Button>
	);
}
