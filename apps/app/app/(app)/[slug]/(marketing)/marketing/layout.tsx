import { Suspense } from "react";
import {
	MarketingSidebar,
	MarketingSidebarFallback,
} from "./marketing-sidebar";

export default function MarketingLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
			<Suspense fallback={<MarketingSidebarFallback />}>
				<MarketingSidebar />
			</Suspense>
			{children}
		</div>
	);
}
