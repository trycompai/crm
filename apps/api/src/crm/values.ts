import type { Prisma } from "@crm/db";
import { Prisma as PrismaNamespace } from "@crm/db";

export function toCents(amount: Prisma.Decimal | null): number | null {
	return amount === null ? null : amount.times(100).toNumber();
}

export function fromCents(cents: number | null | undefined): number | null {
	return cents === null || cents === undefined ? null : cents / 100;
}

export function decimalFromCents(
	cents: number | null | undefined,
): Prisma.Decimal | null {
	return cents === null || cents === undefined
		? null
		: new PrismaNamespace.Decimal(cents).dividedBy(100);
}

export { blankToNull, normalizeEmail } from "@crm/db/values";
