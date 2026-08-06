export const FIELD_ENTITIES = ["COMPANY", "CONTACT", "DEAL"] as const;

export type FieldEntityName = (typeof FIELD_ENTITIES)[number];

export const FIELD_TYPES = [
	"TEXT",
	"LONG_TEXT",
	"NUMBER",
	"DATE",
	"CHECKBOX",
	"SELECT",
	"URL",
	"EMAIL",
	"PHONE",
	"USER",
] as const;

export type FieldTypeName = (typeof FIELD_TYPES)[number];

export type FieldValueColumn =
	| "text"
	| "number"
	| "date"
	| "bool"
	| "optionId"
	| "userId";

const COLUMNS: Record<FieldTypeName, FieldValueColumn> = {
	TEXT: "text",
	LONG_TEXT: "text",
	URL: "text",
	EMAIL: "text",
	PHONE: "text",
	NUMBER: "number",
	DATE: "date",
	CHECKBOX: "bool",
	SELECT: "optionId",
	USER: "userId",
};

const TYPE_LABELS: Record<FieldTypeName, string> = {
	TEXT: "Text",
	LONG_TEXT: "Long text",
	NUMBER: "Number",
	DATE: "Date",
	CHECKBOX: "Checkbox",
	SELECT: "Select",
	URL: "URL",
	EMAIL: "Email",
	PHONE: "Phone",
	USER: "User",
};

export function columnFor(type: FieldTypeName): FieldValueColumn {
	return COLUMNS[type];
}

export function typeLabel(type: FieldTypeName): string {
	return TYPE_LABELS[type];
}

export function usesOptions(type: FieldTypeName): boolean {
	return type === "SELECT";
}

export const RECORD_ID_COLUMNS = {
	COMPANY: "companyId",
	CONTACT: "contactId",
	DEAL: "dealId",
} as const satisfies Record<FieldEntityName, string>;

export type RecordIdColumn =
	(typeof RECORD_ID_COLUMNS)[keyof typeof RECORD_ID_COLUMNS];

export function recordColumn(entity: FieldEntityName): RecordIdColumn {
	return RECORD_ID_COLUMNS[entity];
}

const RESERVED_KEYS = new Set([
	"id",
	"createdat",
	"updatedat",
	"fields",
	"owner",
	"ownerid",
	"new",
]);

export function fieldKeyFromLabel(label: string): string {
	const key = label
		.trim()
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.replace(/^([0-9])/, "f_$1")
		.slice(0, 60);

	return RESERVED_KEYS.has(key) ? `${key}_field` : key;
}

export class FieldValueError extends Error {
	readonly key: string;

	constructor(key: string, message: string) {
		super(message);
		this.name = "FieldValueError";
		this.key = key;
	}
}

export type FieldValueJson = string | number | boolean | null;
