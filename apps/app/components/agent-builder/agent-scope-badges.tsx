import { Badge } from "@crm/ui/components/badge";

export function AgentScopeBadges({
	scopes,
	fallback,
}: {
	scopes: string[];
	fallback: string;
}) {
	if (scopes.length === 0) return <span>{fallback}</span>;

	return (
		<div className="flex min-w-0 flex-wrap gap-1">
			{scopes.map((scope) => (
				<Badge key={scope} variant="outline" translate="no">
					{scope}
				</Badge>
			))}
		</div>
	);
}
