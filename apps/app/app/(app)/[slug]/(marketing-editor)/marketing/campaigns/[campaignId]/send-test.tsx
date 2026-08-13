"use client";

import Send from "@carbon/icons-react/es/Send";
import { Button } from "@crm/ui/components/button";
import type { EmailBlock } from "@crm/ui/components/email-blocks";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function SendTest({
	nodeId,
	subject,
	preheader,
	blocks,
	disabled,
	variant = "default",
}: {
	nodeId: string | null;
	subject: string;
	preheader: string;
	blocks: EmailBlock[];
	disabled?: boolean;
	variant?: "default" | "outline";
}) {
	const trpc = useTRPC();

	const test = useMutation(
		trpc.marketingCampaigns.sendTest.mutationOptions({
			onSuccess: (result) =>
				toast.success(`Test queued to ${result.to}. It goes within a minute.`),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Button
			variant={variant}
			size="sm"
			disabled={!nodeId || disabled || test.isPending}
			onClick={() =>
				nodeId &&
				test.mutate({
					nodeId,
					subject,
					preheader,
					document: { version: 1, blocks } as unknown as Record<
						string,
						unknown
					>,
				})
			}
		>
			{test.isPending ? (
				<Spinner />
			) : (
				<Icon icon={Send} data-icon="inline-start" />
			)}
			Send me a test
		</Button>
	);
}
