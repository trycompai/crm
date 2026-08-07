import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireMailboxAccess } from "@/lib/session";
import { ResearchForm } from "./research-form";

export const metadata: Metadata = {
	title: "Research key",
};

export const instant = false;

export default async function ResearchKeyPage() {
	await requireMailboxAccess();

	return (
		<AuthShell>
			<AuthHeading
				title="Level up your CRM data"
				description="Power your research agent with Context to research every company added to your CRM."
			/>

			<ResearchForm />
		</AuthShell>
	);
}
