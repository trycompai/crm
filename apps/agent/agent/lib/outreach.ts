import type { OutreachVariant } from "@crm/db";

export const OUTREACH_EXPERIMENT = "lode-first-500-v1";

export function assignedVariant(prospectId: string): OutreachVariant {
	const score = [...prospectId].reduce(
		(total, character) => total + character.charCodeAt(0),
		0,
	);
	return (["A", "B", "C"] as const)[score % 3] ?? "A";
}
