import { Badge } from "@crm/ui/components/badge";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import SlackLogo from "@crm/ui/components/brand-logos/slack";
import CompLogo from "@crm/ui/components/logo";
import type { ComponentType, SVGProps } from "react";

const BRANDS: Array<{
	match: RegExp;
	Logo: ComponentType<SVGProps<SVGSVGElement>>;
}> = [
	{ match: /\bcrm\b/i, Logo: CompLogo },
	{ match: /\bslack\b/i, Logo: SlackLogo },
	{ match: /\b(gmail|google)\b/i, Logo: GoogleLogo },
];

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
			{uniqueScopes.map((scope) => {
				const brand = BRANDS.find((candidate) => candidate.match.test(scope));

				return (
					<Badge
						key={scope}
						variant="token"
						translate="no"
						title={scope}
						className="max-w-full"
					>
						{brand ? (
							<brand.Logo aria-hidden="true" data-icon="inline-start" />
						) : null}
						<span className="truncate">{scope}</span>
					</Badge>
				);
			})}
		</div>
	);
}
