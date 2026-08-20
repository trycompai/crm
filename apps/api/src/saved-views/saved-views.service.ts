import { type Db, type FieldEntity, Prisma as PrismaNamespace } from "@crm/db";
import { parseSavedViewFilters } from "@crm/validation/saved-view";
import {
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	SavedView,
	SavedViewCreateInput,
	SavedViewUpdateData,
} from "./saved-views.contracts";

@Injectable()
export class SavedViewsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(entity: FieldEntity, userId: string): Promise<SavedView[]> {
		const rows = await this.db.savedView.findMany({
			where: { entity, OR: [{ shared: true }, { ownerId: userId }] },
			orderBy: { name: "asc" },
		});

		return rows.map((row) => this.serialize(row, userId));
	}

	async create(
		input: SavedViewCreateInput,
		userId: string,
	): Promise<SavedView> {
		try {
			const row = await this.db.savedView.create({
				data: {
					entity: input.entity,
					name: input.name,
					shared: input.shared,
					filters: input.filters,
					ownerId: userId,
				},
			});

			return this.serialize(row, userId);
		} catch (error) {
			throw this.translate(error);
		}
	}

	async update(
		id: string,
		data: SavedViewUpdateData,
		userId: string,
	): Promise<SavedView> {
		const existing = await this.db.savedView.findUnique({ where: { id } });
		if (!existing || existing.ownerId !== userId) {
			throw new NotFoundException(`No saved view with id ${id}.`);
		}

		try {
			const row = await this.db.savedView.update({
				where: { id },
				data: {
					name: data.name,
					shared: data.shared,
					filters: data.filters,
				},
			});

			return this.serialize(row, userId);
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async delete(id: string, userId: string): Promise<{ id: string }> {
		const existing = await this.db.savedView.findUnique({ where: { id } });
		if (!existing || existing.ownerId !== userId) {
			throw new NotFoundException(`No saved view with id ${id}.`);
		}

		try {
			await this.db.savedView.delete({ where: { id } });
		} catch (error) {
			throw this.translate(error, id);
		}

		return { id };
	}

	private serialize(
		row: {
			id: string;
			entity: FieldEntity;
			name: string;
			shared: boolean;
			filters: unknown;
			ownerId: string;
			createdAt: Date;
			updatedAt: Date;
		},
		userId: string,
	): SavedView {
		return {
			id: row.id,
			entity: row.entity,
			name: row.name,
			shared: row.shared,
			filters: parseSavedViewFilters(row.filters),
			mine: row.ownerId === userId,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		};
	}

	private translate(cause: unknown, id?: string): never {
		if (cause instanceof PrismaNamespace.PrismaClientKnownRequestError) {
			if (cause.code === "P2002") {
				throw new ConflictException("You already have a view with that name.");
			}
			if (cause.code === "P2025") {
				throw new NotFoundException(`No saved view with id ${id}.`);
			}
		}
		throw cause;
	}
}
