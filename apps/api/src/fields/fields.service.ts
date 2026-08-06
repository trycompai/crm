import {
	type Db,
	type FieldEntity,
	type Prisma,
	Prisma as PrismaNamespace,
} from "@crm/db";
import {
	attachValues,
	type FieldDefinitionWithOptions,
	FieldValueError,
	type FieldValueJson,
	fieldKeyFromLabel,
	type RecordField,
	readValue,
	recordColumn,
	type SerializedField,
	serializeField,
	usesOptions,
	writeValues,
} from "@crm/db/fields";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	FieldCreateInput,
	FieldReorderInput,
	FieldUpdateData,
} from "./fields.contracts";

const WITH_OPTIONS = {
	options: { orderBy: { position: "asc" } },
} as const satisfies Prisma.FieldDefinitionInclude;

@Injectable()
export class FieldsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async list(
		entity: FieldEntity,
		includeArchived: boolean,
	): Promise<SerializedField[]> {
		const definitions = await this.db.fieldDefinition.findMany({
			where: { entity, ...(includeArchived ? {} : { archivedAt: null }) },
			include: WITH_OPTIONS,
			orderBy: { position: "asc" },
		});

		return definitions.map(serializeField);
	}

	async byKey(entity: FieldEntity, key: string): Promise<SerializedField> {
		const definition = await this.db.fieldDefinition.findUnique({
			where: { entity_key: { entity, key } },
			include: WITH_OPTIONS,
		});

		if (!definition) throw new NotFoundException("That field does not exist.");

		return serializeField(definition);
	}

	async create(input: FieldCreateInput): Promise<SerializedField> {
		const key = fieldKeyFromLabel(input.label);

		if (!key) {
			throw new BadRequestException("That label does not make a usable key.");
		}

		const taken = await this.db.fieldDefinition.findUnique({
			where: { entity_key: { entity: input.entity, key } },
			select: { id: true },
		});

		if (taken) {
			throw new ConflictException(`There is already a field called "${key}".`);
		}

		if (usesOptions(input.type) && input.options.length === 0) {
			throw new BadRequestException("A select needs at least one option.");
		}

		const last = await this.db.fieldDefinition.findFirst({
			where: { entity: input.entity },
			orderBy: { position: "desc" },
			select: { position: true },
		});

		const definition = await this.db.fieldDefinition.create({
			data: {
				entity: input.entity,
				key,
				label: input.label,
				type: input.type,
				agentFilled: input.agentFilled,
				agentBrief: input.agentBrief,
				required: input.required,
				showOnSheet: input.showOnSheet,
				showOnTable: input.showOnTable,
				position: (last?.position ?? -1) + 1,
				options: usesOptions(input.type)
					? {
							create: input.options.map((option, index) => ({
								label: option.label,
								position: index,
							})),
						}
					: undefined,
			},
			include: WITH_OPTIONS,
		});

		if (definition.agentFilled) {
			await this.agent.fieldBackfill(
				definition.entity,
				definition.key,
				"New field",
			);
		}

		return serializeField(definition);
	}

	async update(id: string, data: FieldUpdateData): Promise<SerializedField> {
		const existing = await this.db.fieldDefinition.findUnique({
			where: { id },
			include: WITH_OPTIONS,
		});

		if (!existing) throw new NotFoundException("That field does not exist.");

		const type = data.type ?? existing.type;

		if (data.type && data.type !== existing.type) {
			const values = await this.db.fieldValue.count({
				where: { fieldId: id },
			});

			if (values > 0) {
				throw new ConflictException(
					"This field already holds values, so its type cannot change. Archive it and make a new one.",
				);
			}
		}

		const optionCount = data.options
			? data.options.length
			: existing.options.filter((option) => option.archivedAt === null).length;

		if (usesOptions(type) && optionCount === 0) {
			throw new BadRequestException("A select needs at least one option.");
		}

		const definition = await this.db.$transaction(async (tx) => {
			if (data.options && usesOptions(type)) {
				const keep = new Set(
					data.options
						.map((option) => option.id)
						.filter((value): value is string => Boolean(value)),
				);

				await tx.fieldOption.updateMany({
					where: { fieldId: id, id: { notIn: [...keep] }, archivedAt: null },
					data: { archivedAt: new Date() },
				});

				for (const [index, option] of data.options.entries()) {
					if (option.id) {
						await tx.fieldOption.update({
							where: { id: option.id },
							data: { label: option.label, position: index },
						});
						continue;
					}

					await tx.fieldOption.create({
						data: { fieldId: id, label: option.label, position: index },
					});
				}
			}

			return tx.fieldDefinition.update({
				where: { id },
				data: {
					label: data.label,
					type: data.type,
					agentFilled: data.agentFilled,
					agentBrief: data.agentBrief,
					required: data.required,
					showOnSheet: data.showOnSheet,
					showOnTable: data.showOnTable,
				},
				include: WITH_OPTIONS,
			});
		});

		const briefChanged =
			data.agentBrief !== undefined && data.agentBrief !== existing.agentBrief;
		const turnedOn = data.agentFilled === true && !existing.agentFilled;

		if (definition.agentFilled && (briefChanged || turnedOn)) {
			await this.agent.fieldBackfill(
				definition.entity,
				definition.key,
				"Brief changed",
			);
		}

		return serializeField(definition);
	}

	async reorder(input: FieldReorderInput): Promise<SerializedField[]> {
		const owned = await this.db.fieldDefinition.findMany({
			where: { id: { in: input.ids }, entity: input.entity },
			select: { id: true },
		});

		if (owned.length !== input.ids.length) {
			throw new BadRequestException(
				"That order names a field which is not on this record type.",
			);
		}

		await this.db.$transaction(
			input.ids.map((id, index) =>
				this.db.fieldDefinition.update({
					where: { id },
					data: { position: index },
				}),
			),
		);

		return this.list(input.entity, false);
	}

	async archive(id: string): Promise<SerializedField> {
		try {
			const definition = await this.db.fieldDefinition.update({
				where: { id },
				data: { archivedAt: new Date() },
				include: WITH_OPTIONS,
			});

			return serializeField(definition);
		} catch (error) {
			throw this.translate(error);
		}
	}

	async restore(id: string): Promise<SerializedField> {
		try {
			const definition = await this.db.fieldDefinition.update({
				where: { id },
				data: { archivedAt: null },
				include: WITH_OPTIONS,
			});

			return serializeField(definition);
		} catch (error) {
			throw this.translate(error);
		}
	}

	async delete(id: string): Promise<{ id: string }> {
		try {
			await this.db.fieldDefinition.delete({ where: { id } });
		} catch (error) {
			throw this.translate(error);
		}

		return { id };
	}

	async backfill(id: string): Promise<{ queued: boolean }> {
		const definition = await this.db.fieldDefinition.findUnique({
			where: { id },
			select: {
				entity: true,
				key: true,
				agentFilled: true,
				archivedAt: true,
			},
		});

		if (!definition) throw new NotFoundException("That field does not exist.");

		if (!definition.agentFilled || definition.archivedAt !== null) {
			throw new BadRequestException(
				"Your agents do not fill this field, so there is nothing to run.",
			);
		}

		await this.agent.fieldBackfill(
			definition.entity,
			definition.key,
			"Asked to fill the rest",
		);

		return { queued: true };
	}

	async coverage(id: string): Promise<{ filled: number; total: number }> {
		const definition = await this.db.fieldDefinition.findUnique({
			where: { id },
			select: { entity: true },
		});

		if (!definition) throw new NotFoundException("That field does not exist.");

		const column = recordColumn(definition.entity);

		const [filled, total] = await Promise.all([
			this.db.fieldValue.count({
				where: { fieldId: id, [column]: { not: null } },
			}),
			definition.entity === "COMPANY"
				? this.db.company.count()
				: definition.entity === "CONTACT"
					? this.db.contact.count()
					: this.db.deal.count(),
		]);

		return { filled, total };
	}

	async definitionsFor(
		entity: FieldEntity,
		client: Prisma.TransactionClient = this.db,
	): Promise<FieldDefinitionWithOptions[]> {
		return client.fieldDefinition.findMany({
			where: { entity, archivedAt: null },
			include: WITH_OPTIONS,
			orderBy: { position: "asc" },
		});
	}

	async valuesFor(
		entity: FieldEntity,
		recordId: string,
	): Promise<RecordField[]> {
		const column = recordColumn(entity);

		const [definitions, rows] = await Promise.all([
			this.definitionsFor(entity),
			this.db.fieldValue.findMany({ where: { [column]: recordId } }),
		]);

		return attachValues(definitions, rows);
	}

	async tableValuesFor(
		entity: FieldEntity,
		recordIds: string[],
	): Promise<Map<string, Record<string, FieldValueJson>>> {
		const byRecord = new Map<string, Record<string, FieldValueJson>>();

		if (recordIds.length === 0) return byRecord;

		const definitions = await this.db.fieldDefinition.findMany({
			where: { entity, archivedAt: null, showOnTable: true },
			include: WITH_OPTIONS,
			orderBy: { position: "asc" },
		});

		if (definitions.length === 0) return byRecord;

		const column = recordColumn(entity);

		const rows = await this.db.fieldValue.findMany({
			where: {
				[column]: { in: recordIds },
				fieldId: { in: definitions.map((definition) => definition.id) },
			},
		});

		const byId = new Map(definitions.map((entry) => [entry.id, entry]));

		for (const row of rows) {
			const recordId = row[column];
			if (!recordId) continue;

			const definition = byId.get(row.fieldId);
			if (!definition) continue;

			const current = byRecord.get(recordId) ?? {};
			current[definition.key] = tableValue(
				definition,
				readValue(definition, row),
			);
			byRecord.set(recordId, current);
		}

		return byRecord;
	}

	async applyValues(
		tx: Prisma.TransactionClient,
		entity: FieldEntity,
		recordId: string,
		values: Record<string, unknown>,
	): Promise<void> {
		if (Object.keys(values).length === 0) return;

		const definitions = await this.definitionsFor(entity, tx);

		try {
			await writeValues(tx, entity, recordId, definitions, values);
		} catch (error) {
			if (error instanceof FieldValueError) {
				throw new BadRequestException(error.message);
			}

			throw error;
		}
	}

	private translate(error: unknown): unknown {
		if (
			error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			error.code === "P2025"
		) {
			return new NotFoundException("That field does not exist.");
		}

		return error;
	}
}

function tableValue(
	definition: FieldDefinitionWithOptions,
	value: FieldValueJson,
): FieldValueJson {
	if (definition.type !== "SELECT" || typeof value !== "string") return value;

	return (
		definition.options.find((option) => option.id === value)?.label ?? null
	);
}
