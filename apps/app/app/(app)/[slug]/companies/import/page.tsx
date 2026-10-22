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
					<PageShellTitle>Import Companies from CSV</PageShellTitle>
					<PageShellDescription>
						Upload a CSV file, map its columns to company fields, and create
						records in bulk.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<ImportWizard />
			</PageShellContent>
		</PageShell>
	);
}
