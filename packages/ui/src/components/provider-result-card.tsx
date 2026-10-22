import { Badge } from "@crm/ui/components/badge";
import { Link } from "@crm/ui/components/link";
import { ProviderMark } from "@crm/ui/components/provider-mark";
import type { ProviderBrand } from "@crm/ui/lib/provider-brand";
import type { ReactNode } from "react";

export function ProviderResultCard({
	slug,
	provider,
	brand,
	title,
	countLabel,
	children,
}: {
	slug: string;
	provider: string;
	brand?: ProviderBrand | null;
	title: string;
	countLabel?: string;
	children: ReactNode;
}) {
	return (
		<section
			aria-label={`${provider} ${title}`}
			className="w-full max-w-2xl overflow-hidden rounded-lg border bg-card"
		>
			<header className="flex items-center gap-3 border-b bg-muted px-4 py-3">
				<ProviderMark
					slug={slug}
					name={provider}
					brand={brand}
					className="size-6"
				/>
				<div className="min-w-0 flex-1">
					<h3 className="truncate font-medium text-sm">{title}</h3>
					<p className="text-muted-foreground text-xs">{provider}</p>
				</div>
				{countLabel ? (
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						{countLabel}
					</span>
				) : null}
			</header>
			<div className="max-h-[28rem] divide-y overflow-y-auto">{children}</div>
		</section>
	);
}

export function ProviderResultItem({
	title,
	reference,
	href,
	details,
	tags,
}: {
	title?: string;
	reference?: string;
	href?: string;
	details: readonly { label: string; value: string }[];
	tags: readonly string[];
}) {
	return (
		<article className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
			<div className="min-w-0">
				{title ? (
					<h4 className="truncate font-medium text-sm">
						{href ? (
							<Link
								href={href}
								target="_blank"
								rel="noreferrer"
								variant="quiet"
							>
								{title}
							</Link>
						) : (
							title
						)}
					</h4>
				) : null}
				{reference ? (
					<code className="mt-0.5 block truncate text-muted-foreground text-xs">
						{reference}
					</code>
				) : null}
				<dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
					{details.map((detail) => (
						<div key={detail.label} className="flex items-center gap-1.5">
							<dt className="text-muted-foreground">{detail.label}</dt>
							<dd>{detail.value}</dd>
						</div>
					))}
				</dl>
			</div>
			{tags.length > 0 ? (
				<div className="flex flex-wrap gap-1 sm:max-w-48 sm:justify-end">
					{tags.map((tag) => (
						<Badge key={tag} variant="token">
							{tag}
						</Badge>
					))}
				</div>
			) : null}
		</article>
	);
}
