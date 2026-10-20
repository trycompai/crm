import type { AccessMode, Vendor } from "./vendor";
import { vendors } from "./vendors";

export type VendorSlug = (typeof vendors)[number]["slug"];

export function vendorBySlug(slug: string): Vendor | undefined {
	return vendors.find((vendor) => vendor.slug === slug);
}

export function vendorAccess(vendor: Vendor, mode: AccessMode) {
	return vendor.access[mode];
}

export { vendors };
