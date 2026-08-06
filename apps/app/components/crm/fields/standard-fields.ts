import type { FieldEntity } from "./fields-entity";

export const STANDARD_FIELDS: Record<FieldEntity, readonly string[]> = {
	COMPANY: [
		"Name",
		"Domain",
		"Website",
		"Phone",
		"Email",
		"City",
		"Country",
		"Owner",
	],
	CONTACT: [
		"First name",
		"Last name",
		"Title",
		"Email",
		"Phone",
		"LinkedIn",
		"GitHub",
		"Company",
		"Owner",
	],
	DEAL: [
		"Name",
		"Amount",
		"Currency",
		"Close date",
		"Company",
		"Owner",
		"Stage",
	],
};
