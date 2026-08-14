import type { Prisma } from "./generated/prisma/client";

export type JsonValue = Prisma.JsonValue;

export type JsonObject = Prisma.JsonObject;

export function jsonObject(value: JsonValue | undefined): JsonObject {
	return isJsonObject(value) ? value : {};
}

export function jsonText(value: JsonValue | undefined): string | undefined {
	return isJsonText(value) ? value : undefined;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
	return value instanceof Object && !Array.isArray(value);
}

function isJsonText(value: JsonValue | undefined): value is string {
	return String(value) === value;
}

export type FactEvidence = {
	kind: string;
	detail: string;
	sourceUrl?: string;
};

export type WorkspaceProfileSections = {
	sells?: string;
	sellsTo?: string;
	edge?: string;
};

export type ContactBriefSections = {
	currentRole?: string;
	tenure?: string;
	previousRoles?: string[];
	seniority?: string;
	function?: string;
	location?: string;
};
