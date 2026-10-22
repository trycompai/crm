import {
	ProviderResultCard,
	ProviderResultItem,
} from "@crm/ui/components/provider-result-card";
import type { ProviderCardModel } from "@/lib/connection-result";

export function ProviderConnectionResult({
	result,
}: {
	result: ProviderCardModel;
}) {
	return (
		<ProviderResultCard
			slug={result.slug}
			provider={result.provider}
			brand={result.brand}
			title={result.title}
			countLabel={result.countLabel}
		>
			{result.items.map((item) => (
				<ProviderResultItem
					key={item.key}
					title={item.title}
					reference={item.reference}
					href={item.href}
					details={item.details}
					tags={item.tags}
				/>
			))}
		</ProviderResultCard>
	);
}
