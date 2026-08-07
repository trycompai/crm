import { Badge } from "@crm/ui/components/badge";

export function AgentScopeBadges({
	scopes,
	fallback,
}: {
	scopes: string[];
	fallback: string;
}) {
	const uniqueScopes = [...new Set(scopes)];
	if (uniqueScopes.length === 0) return <span>{fallback}</span>;

	return (
		<div className="flex min-w-0 flex-wrap gap-1">
			{uniqueScopes.map((scope) => (
				<Badge
					key={scope}
					variant="outline"
					translate="no"
					title={scope}
					className="max-w-full rounded-sm text-ellipsis transition-colors focus-visible:ring-2"
				>
					{scope}
				</Badge>
			))}
		</div>
	);
}
