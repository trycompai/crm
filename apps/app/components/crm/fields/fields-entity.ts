import type { CrmRecordKind } from "@/components/crm/record-sheet/record-stack";

export type FieldEntity = "COMPANY" | "CONTACT" | "DEAL";

const TO_ENTITY: Record<CrmRecordKind, FieldEntity> = {
	company: "COMPANY",
	contact: "CONTACT",
	deal: "DEAL",
};

const TO_KIND: Record<FieldEntity, CrmRecordKind> = {
	COMPANY: "company",
	CONTACT: "contact",
	DEAL: "deal",
};

export function entityOf(kind: CrmRecordKind): FieldEntity {
	return TO_ENTITY[kind];
}

export function kindOf(entity: FieldEntity): CrmRecordKind {
	return TO_KIND[entity];
}
