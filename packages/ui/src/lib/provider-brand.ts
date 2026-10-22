import type { SimpleIcon } from "simple-icons";
import * as simpleIcons from "simple-icons";

export type ProviderBrand = Pick<SimpleIcon, "hex" | "path" | "slug" | "title">;

const icons = Object.values(simpleIcons);

export function providerBrand(
	slug: string,
	name: string,
): ProviderBrand | null {
	const normalizedSlug = normalize(slug);
	const normalizedName = normalize(name);
	const icon = icons.find(
		(candidate) =>
			normalize(candidate.slug) === normalizedSlug ||
			normalize(candidate.title) === normalizedName,
	);
	return icon
		? {
				hex: icon.hex,
				path: icon.path,
				slug: icon.slug,
				title: icon.title,
			}
		: null;
}

function normalize(value: string) {
	return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
