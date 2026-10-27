import { PageShell, PageShellFallback } from "@crm/ui/components/page-shell";
import { cn } from "@crm/ui/lib/utils";

export function ConnectionPage({
	centered = false,
	className,
	children,
}: {
	centered?: boolean;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<PageShell
			width="narrow"
			className={cn(centered && "justify-center", className)}
		>
			{children}
		</PageShell>
	);
}

export function ConnectionPageLoading() {
	return <PageShellFallback width="narrow" shape="settings" />;
}
