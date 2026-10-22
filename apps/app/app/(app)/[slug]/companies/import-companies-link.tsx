import Upload from "@carbon/icons-react/es/Upload";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import Link from "next/link";
import { workspaceUrl } from "@/lib/workspace-url";

export async function ImportCompaniesLink({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	return (
		<Button asChild variant="outline">
			<Link href={workspaceUrl(slug, "/companies/import")}>
				<Icon icon={Upload} data-icon="inline-start" />
				Import CSV
			</Link>
		</Button>
	);
}

export function ImportCompaniesLinkFallback() {
	return (
		<Button variant="outline" disabled>
			<Icon icon={Upload} data-icon="inline-start" />
			Import CSV
		</Button>
	);
}
