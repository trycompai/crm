import type { Db } from "@crm/db";

export type Settings = Record<string, unknown>;

export function readSettings(value: unknown): Settings {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Settings;
	}
	return {};
}

export function settingsLabel(raw: unknown): string {
	const settings = readSettings(raw);
	const label = settings.label as unknown as string;
	return typeof label === "string" ? label : "Untitled";
}

export async function findTagged(db: Db, tag: string | null) {
	return db.company.findMany({
		where: {
			...(tag ? { industry: tag } : {}),
		},
		select: { id: true, name: true },
	});
}
