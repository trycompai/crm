import {
	columnFor,
	FieldValueError,
	type FieldValueJson,
	type FieldValueWrite,
	recordColumn,
	typeLabel,
} from "./fields-shape";
import { Prisma } from "./generated/prisma/client";
import type { FieldEntity, FieldType } from "./generated/prisma/enums";
import type {
	FieldDefinitionModel,
	FieldOptionModel,
	FieldValueModel,
} from "./generated/prisma/models";

export * from "./fields-shape";

export type FieldDefinitionWithOptions = FieldDefinitionModel & {
	options: FieldOptionModel[];
};

export type SerializedFieldOption = {
	id: string;
	label: string;
	position: number;
};

export type SerializedField = {
	id: string;
	entity: FieldEntity;
	key: string;
	label: string;
	type: FieldType;
	typeLabel: string;
	agentFilled: boolean;
	agentBrief: string | null;
	required: boolean;
	showOnSheet: boolean;
	showOnTable: boolean;
	showOnFilter: boolean;
	position: number;
	archived: boolean;
	options: SerializedFieldOption[];
};

export function serializeField(
	definition: FieldDefinitionWithOptions,
): SerializedField {
	return {
		id: definition.id,
		entity: definition.entity,
		key: definition.key,
		label: definition.label,
		type: definition.type,
		typeLabel: typeLabel(definition.type),
		agentFilled: definition.agentFilled,
		agentBrief: definition.agentBrief,
		required: definition.required,
		showOnSheet: definition.showOnSheet,
		showOnTable: definition.showOnTable,
		showOnFilter: definition.showOnFilter,
		position: definition.position,
		archived: definition.archivedAt !== null,
		options: definition.options
			.filter((option) => option.archivedAt === null)
			.sort((left, right) => left.position - right.position)
			.map((option) => ({
				id: option.id,
				label: option.label,
				position: option.position,
			})),
	};
}

export function serializeFieldFor(
	definition: FieldDefinitionWithOptions,
	value: FieldValueJson,
): SerializedField {
	const field = serializeField(definition);

	if (definition.type !== "SELECT" || typeof value !== "string") return field;
	if (field.options.some((option) => option.id === value)) return field;

	const retired = definition.options.find((option) => option.id === value);
	if (!retired) return field;

	return {
		...field,
		options: [
			...field.options,
			{ id: retired.id, label: retired.label, position: retired.position },
		].sort((left, right) => left.position - right.position),
	};
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

export function coerceValue(
	definition: FieldDefinitionWithOptions,
	input: unknown,
): FieldValueWrite {
	const blank =
		input === null ||
		input === undefined ||
		(typeof input === "string" && input.trim() === "");

	if (blank) {
		if (definition.required) {
			throw new FieldValueError(
				definition.key,
				`${definition.label} cannot be empty.`,
			);
		}

		return { [columnFor(definition.type)]: null };
	}

	switch (definition.type) {
		case "CHECKBOX": {
			if (typeof input === "boolean") return { bool: input };
			if (input === "true" || input === "false") {
				return { bool: input === "true" };
			}
			throw new FieldValueError(
				definition.key,
				`${definition.label} takes true or false.`,
			);
		}

		case "NUMBER": {
			const parsed =
				typeof input === "number" ? input : Number(String(input).trim());

			if (!Number.isFinite(parsed)) {
				throw new FieldValueError(
					definition.key,
					`${definition.label} takes a number.`,
				);
			}

			return { number: new Prisma.Decimal(parsed) };
		}

		case "DATE": {
			const raw = String(input).trim();
			const dateOnly = ISO_DATE.test(raw);

			if (!dateOnly && !ISO_DATE_TIME.test(raw)) {
				throw new FieldValueError(
					definition.key,
					`${definition.label} takes a date like 2027-03-31.`,
				);
			}

			const parsed = new Date(dateOnly ? `${raw}T00:00:00.000Z` : raw);

			if (Number.isNaN(parsed.getTime())) {
				throw new FieldValueError(
					definition.key,
					`${definition.label} takes a date like 2027-03-31.`,
				);
			}

			return { date: parsed };
		}

		case "SELECT": {
			const raw = String(input).trim();
			const option = definition.options.find(
				(entry) =>
					entry.archivedAt === null &&
					(entry.id === raw || entry.label.toLowerCase() === raw.toLowerCase()),
			);

			if (!option) {
				throw new FieldValueError(
					definition.key,
					`${definition.label} has no option "${raw}".`,
				);
			}

			return { optionId: option.id };
		}

		case "USER":
			return { userId: String(input).trim() };

		default:
			return { text: String(input).trim() };
	}
}

export function readValue(
	definition: FieldDefinitionWithOptions,
	row: FieldValueModel | undefined,
): FieldValueJson {
	if (!row) return null;

	switch (definition.type) {
		case "CHECKBOX":
			return row.bool ?? null;
		case "NUMBER":
			return row.number === null ? null : Number(row.number);
		case "DATE":
			return row.date === null ? null : row.date.toISOString();
		case "SELECT":
			return row.optionId ?? null;
		case "USER":
			return row.userId ?? null;
		default:
			return row.text ?? null;
	}
}

export type RecordField = SerializedField & { value: FieldValueJson };

export function attachValues(
	definitions: FieldDefinitionWithOptions[],
	rows: FieldValueModel[],
): RecordField[] {
	const byField = new Map(rows.map((row) => [row.fieldId, row]));

	return definitions
		.filter((definition) => definition.archivedAt === null)
		.sort((left, right) => left.position - right.position)
		.map((definition) => {
			const value = readValue(definition, byField.get(definition.id));

			return { ...serializeFieldFor(definition, value), value };
		});
}

export type FieldWriter = {
	fieldValue: {
		deleteMany(args: { where: Record<string, unknown> }): Promise<unknown>;
		upsert(args: {
			where: Record<string, unknown>;
			create: Record<string, unknown>;
			update: Record<string, unknown>;
		}): Promise<unknown>;
	};
	user: {
		findMany(args: {
			where: { id: { in: string[] } };
			select: { id: true };
		}): Promise<{ id: string }[]>;
	};
};

export async function writeValues(
	tx: FieldWriter,
	entity: FieldEntity,
	recordId: string,
	definitions: FieldDefinitionWithOptions[],
	values: Record<string, unknown>,
): Promise<void> {
	const column = recordColumn(entity);
	const byKey = new Map(
		definitions
			.filter((definition) => definition.archivedAt === null)
			.map((definition) => [definition.key, definition]),
	);

	const writes = Object.entries(values).map(([key, input]) => {
		const definition = byKey.get(key);

		if (!definition) {
			throw new FieldValueError(key, `There is no field called "${key}".`);
		}

		const data = coerceValue(definition, input);

		return { definition, data, stored: data[columnFor(definition.type)] };
	});

	await assertUsersExist(tx, writes);

	for (const { definition, data, stored } of writes) {
		if (stored === null || stored === undefined) {
			await tx.fieldValue.deleteMany({
				where: { fieldId: definition.id, [column]: recordId },
			});
			continue;
		}

		await tx.fieldValue.upsert({
			where: {
				[`fieldId_${column}`]: { fieldId: definition.id, [column]: recordId },
			},
			create: { fieldId: definition.id, [column]: recordId, ...data },
			update: data,
		});
	}
}

type PendingWrite = {
	definition: FieldDefinitionWithOptions;
	stored: unknown;
};

async function assertUsersExist(
	tx: FieldWriter,
	writes: PendingWrite[],
): Promise<void> {
	const wanted = writes.filter(
		(write): write is PendingWrite & { stored: string } =>
			write.definition.type === "USER" && typeof write.stored === "string",
	);

	if (wanted.length === 0) return;

	const known = await tx.user.findMany({
		where: { id: { in: [...new Set(wanted.map((write) => write.stored))] } },
		select: { id: true },
	});

	const found = new Set(known.map((row) => row.id));

	for (const write of wanted) {
		if (!found.has(write.stored)) {
			throw new FieldValueError(
				write.definition.key,
				`${write.definition.label} takes someone who works here.`,
			);
		}
	}
}
