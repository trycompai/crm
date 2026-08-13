"use client";

import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import { Icon } from "@crm/ui/components/icon";
import Link from "next/link";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function EditShellLink() {
	const workspaceUrl = useWorkspaceUrl();

	return (
		<Link
			href={workspaceUrl("/marketing/templates")}
			prefetch
			className="flex shrink-0 items-center gap-0.5 font-medium text-xs hover:underline"
		>
			Edit
			<Icon icon={ChevronRight} className="size-3" />
		</Link>
	);
}
