import type { RecordKind } from "@/components/crm/record-sheet/record-stack";
import type { FieldEntity } from "./fields-entity";

export const SHEET_TITLE = "Fields";

const SUBTITLE: Record<RecordKind, string> = {
	company: "This shapes every company in your CRM.",
	contact: "This shapes every contact in your CRM.",
	deal: "This shapes every deal in your CRM.",
};

export function subtitleFor(kind: RecordKind): string {
	return SUBTITLE[kind];
}

export const STANDARD_ROW = "Standard fields";
export const STANDARD_NOTE = "reorder and hide only";
export const CUSTOM_GROUP = "Custom fields";
export const DRAG_NOTE = "Drag to order";
export const ARCHIVED_ROW = "Archived";
export const ARCHIVED_NOTE = "values kept, hidden everywhere";
export const NEW_FIELD = "New field";
export const ORDER_NOTE = "Order here is the order on the sheet";
export const MANUAL_ONLY = "Manual only";
export const TABLE_NOTE = "also a column on the table";

export const EMPTY_TITLE = "No custom fields yet";
export const EMPTY_BODY =
	"Create dynamic fields that your agents can research and pre-fill.";

export const ERROR_TITLE = "We could not load your fields";
export const ERROR_BODY =
	"Your fields are still there. Try again in a moment, before you create anything new.";
export const RETRY = "Try again";

export const LABEL_LABEL = "Label";
export const KEY_LABEL = "Key";
export const KEY_HELP =
	"What the API and your agents call it. Set from the label, fixed once saved — renaming the label later never breaks a caller.";
export const AGENT_LABEL = "Let your agents fill this";
export const AGENT_HELP =
	"They propose a value with a source, and never overwrite yours.";
export const BRIEF_LABEL = "What counts as an answer";
export const BRIEF_HELP =
	"Leave it empty and your agents work from the label and type alone.";
export const TYPE_LABEL = "Type";
export const OPTIONS_LABEL = "Options";
export const ADD_OPTION = "Add option";
export const ALL_FILLED = "Nothing left to fill";

export function optionLabel(index: number): string {
	return `Option ${index + 1}`;
}
export const ADD_FIELD = "Create field";
export const CANCEL = "Cancel";
export const SAVE = "Save changes";
export const ARCHIVE = "Archive";
export const FILL_REST = "Fill the rest";

const SHEET_PLACEMENT: Record<FieldEntity, string> = {
	COMPANY: "Show on the company sheet",
	CONTACT: "Show on the contact sheet",
	DEAL: "Show on the deal sheet",
};

const TABLE_PLACEMENT: Record<FieldEntity, string> = {
	COMPANY: "Offer as a column on the Companies table",
	CONTACT: "Offer as a column on the Contacts table",
	DEAL: "Offer as a column on the Deals table",
};

export function sheetPlacement(entity: FieldEntity): string {
	return SHEET_PLACEMENT[entity];
}

export function tablePlacement(entity: FieldEntity): string {
	return TABLE_PLACEMENT[entity];
}

export const ENTITY_TABS = [
	{ kind: "company", label: "Companies" },
	{ kind: "contact", label: "Contacts" },
	{ kind: "deal", label: "Deals" },
] as const satisfies readonly { kind: RecordKind; label: string }[];
