import type { RecordKind } from "@/components/crm/record-sheet/record-stack";

export type FieldEntity = "COMPANY" | "CONTACT" | "DEAL";

const TO_ENTITY = {
	company: "COMPANY",
	contact: "CONTACT",
	deal: "DEAL",
} satisfies Record<RecordKind, FieldEntity>;

const TO_KIND = {
	COMPANY: "company",
	CONTACT: "contact",
	DEAL: "deal",
} satisfies Record<FieldEntity, RecordKind>;

export function entityOf(kind: RecordKind): FieldEntity {
	return TO_ENTITY[kind];
}

export function kindOf(entity: FieldEntity): RecordKind {
	return TO_KIND[entity];
}
