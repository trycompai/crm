import LinearLogo from "@crm/ui/components/brand-logos/linear";
import SupabaseLogo from "@crm/ui/components/brand-logos/supabase";
import VercelLogo from "@crm/ui/components/brand-logos/vercel";
import { cn } from "@crm/ui/lib/utils";
import type { ProviderBrand } from "@crm/ui/lib/provider-brand";
import type { ComponentType, SVGProps } from "react";
import {
	siClerk,
	siCloudflare,
	siNeon,
	siPlanetscale,
	siPrisma,
} from "simple-icons";

const PROVIDER_LOGOS: Readonly<
	Record<string, ComponentType<SVGProps<SVGSVGElement>>>
> = {
	linear: LinearLogo,
	supabase: SupabaseLogo,
	vercel: VercelLogo,
};

const PROVIDER_ICONS = {
	clerk: siClerk,
	cloudflare: siCloudflare,
	neon: siNeon,
	planetscale: siPlanetscale,
	prisma: siPrisma,
} as const;

export function ProviderMark({
	slug,
	name,
	brand,
	className,
}: {
	slug: string;
	name: string;
	brand?: ProviderBrand | null;
	className?: string;
}) {
	const Logo = PROVIDER_LOGOS[slug];
	if (Logo) return <Logo className={className} />;
	const icon = PROVIDER_ICONS[slug as keyof typeof PROVIDER_ICONS];
	if (icon) {
		return (
			<svg
				aria-hidden="true"
				className={cn(
					"shrink-0",
					["planetscale", "prisma"].includes(slug) &&
						"dark:brightness-0 dark:invert",
					className,
				)}
				style={{ color: `#${icon.hex}` }}
				viewBox="0 0 24 24"
			>
				<path d={icon.path} fill="currentColor" />
			</svg>
		);
	}
	if (brand) {
		return (
			<svg
				aria-hidden="true"
				className={cn("shrink-0 dark:brightness-0 dark:invert", className)}
				style={{ color: `#${brand.hex}` }}
				viewBox="0 0 24 24"
			>
				<path d={brand.path} fill="currentColor" />
			</svg>
		);
	}

	const words = name.trim().split(/\s+/);
	const initials =
		words.length > 1
			? words
					.slice(0, 2)
					.map((word) => word.at(0))
					.join("")
			: name.slice(0, 2);

	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-md border bg-muted font-semibold text-[0.625rem] tracking-tight",
				className,
			)}
		>
			{initials.toUpperCase()}
		</span>
	);
}
