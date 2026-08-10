import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { ConnectionPage } from "../connection-page";

export default async function IntakeConnectionPage({
	params,
}: PageProps<"/[slug]/settings/connections/intake">) {
	const { slug } = await params;

	return (
		<ConnectionPage centered className="max-w-(--container-narrow) text-center">
			<header className="flex flex-col gap-3 px-(--spacing-block-inline)">
				<h1 className="font-medium text-2xl tracking-tight">Intake endpoint</h1>
				<p className="text-muted-foreground text-sm leading-relaxed">
					This connection is not available yet. No endpoint, API key, or intake
					activity has been created for this workspace.
				</p>
			</header>
			<div>
				<Button asChild variant="outline">
					<Link href={`/${slug}/settings/connections`}>
						Back to connections
					</Link>
				</Button>
			</div>
		</ConnectionPage>
	);
}
