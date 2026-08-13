"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { toast } from "sonner";
import { useCampaignOptionsInvalidation } from "@/components/marketing/use-marketing-facets";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

function Placeholder({ label }: { label: string }) {
	return (
		<Button disabled>
			<Icon icon={Add} data-icon="inline-start" />
			{label}
		</Button>
	);
}

function Deferred({ label, children }: { label: string; children: ReactNode }) {
	return (
		<Suspense fallback={<Placeholder label={label} />}>{children}</Suspense>
	);
}

export function CreateCampaignButton() {
	return (
		<Deferred label="New campaign">
			<CampaignButton />
		</Deferred>
	);
}

export function CreateSegmentButton() {
	return (
		<Deferred label="New segment">
			<SegmentButton />
		</Deferred>
	);
}

export function CreateTemplateButton() {
	return (
		<Deferred label="New template">
			<TemplateButton />
		</Deferred>
	);
}

function CampaignButton() {
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const invalidateCampaignOptions = useCampaignOptionsInvalidation();

	const create = useMutation(
		trpc.marketingCampaigns.create.mutationOptions({
			onSuccess: (row) => {
				void invalidateCampaignOptions();
				router.push(workspaceUrl(`/marketing/campaigns/${row.id}`));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Button
			disabled={create.isPending}
			onClick={() => create.mutate({ name: "Untitled campaign", kind: "DRIP" })}
		>
			{create.isPending ? (
				<Spinner />
			) : (
				<Icon icon={Add} data-icon="inline-start" />
			)}
			New campaign
		</Button>
	);
}

function SegmentButton() {
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();

	const create = useMutation(
		trpc.marketingSegments.create.mutationOptions({
			onSuccess: (row) =>
				router.push(workspaceUrl(`/marketing/segments/${row.id}`)),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Button
			disabled={create.isPending}
			onClick={() => create.mutate({ name: "Untitled segment" })}
		>
			{create.isPending ? (
				<Spinner />
			) : (
				<Icon icon={Add} data-icon="inline-start" />
			)}
			New segment
		</Button>
	);
}

function TemplateButton() {
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();

	const create = useMutation(
		trpc.marketingTemplates.create.mutationOptions({
			onSuccess: (row) =>
				router.push(workspaceUrl(`/marketing/templates/${row.id}`)),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Button
			disabled={create.isPending}
			onClick={() => create.mutate({ name: "Untitled template" })}
		>
			{create.isPending ? (
				<Spinner />
			) : (
				<Icon icon={Add} data-icon="inline-start" />
			)}
			New template
		</Button>
	);
}
