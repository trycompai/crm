import type { Metadata } from "next";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = {
	title: "Import Companies",
};

export default function ImportCompaniesPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Import companies</PageShellTitle>
					<PageShellDescription>
						Upload a CSV file and match its columns to company fields.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<ImportWizard />
			</PageShellContent>
		</PageShell>
	);
}
