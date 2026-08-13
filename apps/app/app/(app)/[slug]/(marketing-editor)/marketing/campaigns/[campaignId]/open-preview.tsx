"use client";

import Launch from "@carbon/icons-react/es/Launch";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import Link from "next/link";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function OpenPreview({
	nodeId,
	disabled,
}: {
	nodeId: string | null;
	disabled?: boolean;
}) {
	const workspaceUrl = useWorkspaceUrl();

	if (!nodeId || disabled) {
		return (
			<Button variant="outline" size="sm" disabled>
				<Icon icon={Launch} data-icon="inline-start" />
				View the preview
			</Button>
		);
	}

	return (
		<Button asChild variant="outline" size="sm">
			<Link
				href={workspaceUrl(`/marketing/preview/${nodeId}`)}
				target="_blank"
				rel="noreferrer"
			>
				<Icon icon={Launch} data-icon="inline-start" />
				View the preview
			</Link>
		</Button>
	);
}
