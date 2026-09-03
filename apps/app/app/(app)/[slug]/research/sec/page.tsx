import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { edgarConfigured } from "@/lib/edgar";
import { requireSession } from "@/lib/session";
import { SecResearch } from "./sec-research";

export const metadata: Metadata = {
	title: "SEC research",
};

export default function SecResearchPage() {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>SEC research</PageShellTitle>
					<PageShellDescription>
						US public companies from their EDGAR filings: profile, filings,
						major shareholders, executives and their pay.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Research />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Research() {
	await requireSession();

	return <SecResearch configured={edgarConfigured()} />;
}
