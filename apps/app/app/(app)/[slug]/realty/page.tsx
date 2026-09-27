import type { Metadata } from "next";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { RealtyDashboard } from "./realty-dashboard";

export const metadata: Metadata = {
	title: "Realty",
};

export default async function RealtyPage() {
	await requireSession();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Realty workspace</PageShellTitle>
					<PageShellDescription>
						Keep buyers, sellers, listings, and next steps moving.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<RealtyDashboard />
			</PageShellContent>
		</PageShell>
	);
}
