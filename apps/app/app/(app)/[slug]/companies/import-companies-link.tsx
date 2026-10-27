import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { UploadIcon } from "lucide-react";
import Link from "next/link";
import { workspaceUrl } from "@/lib/workspace-url";

const LABEL = "Import CSV";

export async function ImportCompaniesLink({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const href = workspaceUrl(slug, "/companies/import");
	return (
		<>
			<Button asChild variant="outline" size="icon" className="sm:hidden">
				<Link href={href} aria-label={LABEL}>
					<Icon icon={UploadIcon} />
				</Link>
			</Button>
			<Button asChild variant="outline" className="max-sm:hidden">
				<Link href={href}>
					<Icon icon={UploadIcon} data-icon="inline-start" />
					{LABEL}
				</Link>
			</Button>
		</>
	);
}

export function ImportCompaniesLinkFallback() {
	return (
		<>
			<Button
				variant="outline"
				size="icon"
				className="sm:hidden"
				aria-label={LABEL}
				disabled
			>
				<Icon icon={UploadIcon} />
			</Button>
			<Button variant="outline" className="max-sm:hidden" disabled>
				<Icon icon={UploadIcon} data-icon="inline-start" />
				{LABEL}
			</Button>
		</>
	);
}
