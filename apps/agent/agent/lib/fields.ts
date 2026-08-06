import { db } from "@crm/db";
import type { FieldEntity, FieldType } from "@crm/db/enums";
import {
	attachValues,
	type FieldDefinitionWithOptions,
	FieldValueError,
	fieldKeyFromLabel,
	type RecordField,
	recordColumn,
	type SerializedField,
	serializeField,
	usesOptions,
	writeValues,
} from "@crm/db/fields";

const WITH_OPTIONS = { options: { orderBy: { position: "asc" } } } as const;

export type { FieldEntity, FieldType, RecordField, SerializedField };

async function definitionsFor(
	entity: FieldEntity,
): Promise<FieldDefinitionWithOptions[]> {
	return db.fieldDefinition.findMany({
		where: { entity, archivedAt: null },
		include: WITH_OPTIONS,
		orderBy: { position: "asc" },
	});
}

export async function listFields(
	entity: FieldEntity,
): Promise<SerializedField[]> {
	const definitions = await definitionsFor(entity);
	return definitions.map(serializeField);
}

export async function readFields(
	entity: FieldEntity,
	recordId: string,
): Promise<RecordField[]> {
	const column = recordColumn(entity);

	const [definitions, rows] = await Promise.all([
		definitionsFor(entity),
		db.fieldValue.findMany({ where: { [column]: recordId } }),
	]);

	return attachValues(definitions, rows);
}

export type WriteResult =
	| { written: true; key: string; value: unknown }
	| { written: false; reason: string };

export async function writeField(input: {
	entity: FieldEntity;
	recordId: string;
	key: string;
	value: unknown;
}): Promise<WriteResult> {
	const definitions = await definitionsFor(input.entity);
	const definition = definitions.find((entry) => entry.key === input.key);

	if (!definition) {
		return {
			written: false,
			reason: `There is no field called "${input.key}" on ${input.entity.toLowerCase()}s. Call list_fields to see what exists.`,
		};
	}

	if (!definition.agentFilled) {
		return {
			written: false,
			reason: `"${input.key}" is marked manual only, so a rep keeps it by hand.`,
		};
	}

	try {
		await writeValues(db, input.entity, input.recordId, definitions, {
			[input.key]: input.value,
		});
	} catch (error) {
		if (error instanceof FieldValueError) {
			return { written: false, reason: error.message };
		}

		throw error;
	}

	return { written: true, key: input.key, value: input.value };
}

export async function createField(input: {
	entity: FieldEntity;
	label: string;
	type: FieldType;
	options?: string[];
	agentBrief?: string;
}): Promise<SerializedField | { created: false; reason: string }> {
	const key = fieldKeyFromLabel(input.label);

	if (!key) {
		return { created: false, reason: "That label does not make a usable key." };
	}

	const taken = await db.fieldDefinition.findUnique({
		where: { entity_key: { entity: input.entity, key } },
		select: { id: true },
	});

	if (taken) {
		return {
			created: false,
			reason: `There is already a field called "${key}" on ${input.entity.toLowerCase()}s.`,
		};
	}

	if (usesOptions(input.type) && (input.options ?? []).length === 0) {
		return { created: false, reason: "A select needs at least one option." };
	}

	const last = await db.fieldDefinition.findFirst({
		where: { entity: input.entity },
		orderBy: { position: "desc" },
		select: { position: true },
	});

	const definition = await db.fieldDefinition.create({
		data: {
			entity: input.entity,
			key,
			label: input.label,
			type: input.type,
			agentBrief: input.agentBrief ?? null,
			position: (last?.position ?? -1) + 1,
			options: usesOptions(input.type)
				? {
						create: (input.options ?? []).map((label, index) => ({
							label,
							position: index,
						})),
					}
				: undefined,
		},
		include: WITH_OPTIONS,
	});

	return serializeField(definition);
}

export async function updateFieldBrief(input: {
	entity: FieldEntity;
	key: string;
	agentBrief: string | null;
	agentFilled?: boolean;
}): Promise<SerializedField | { updated: false; reason: string }> {
	const existing = await db.fieldDefinition.findUnique({
		where: { entity_key: { entity: input.entity, key: input.key } },
		select: { id: true },
	});

	if (!existing) {
		return {
			updated: false,
			reason: `There is no field called "${input.key}".`,
		};
	}

	const definition = await db.fieldDefinition.update({
		where: { id: existing.id },
		data: { agentBrief: input.agentBrief, agentFilled: input.agentFilled },
		include: WITH_OPTIONS,
	});

	return serializeField(definition);
}

export async function archiveField(input: {
	entity: FieldEntity;
	key: string;
}): Promise<{ archived: boolean; reason?: string }> {
	const existing = await db.fieldDefinition.findUnique({
		where: { entity_key: { entity: input.entity, key: input.key } },
		select: { id: true },
	});

	if (!existing) {
		return {
			archived: false,
			reason: `There is no field called "${input.key}".`,
		};
	}

	await db.fieldDefinition.update({
		where: { id: existing.id },
		data: { archivedAt: new Date() },
	});

	return { archived: true };
}
