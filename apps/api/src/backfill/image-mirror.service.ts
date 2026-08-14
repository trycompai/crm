import type { Db, Prisma } from "@crm/db";
import { blobEnabled, mirror } from "@crm/db/blob";
import {
	BLOB_HOST_SUFFIX,
	COMPANY_IMAGE_FIELDS,
	type CompanyImageField,
} from "@crm/db/images";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

const MAX_PER_SWEEP = 25;

type CompanyImageRow = Record<CompanyImageField, string | null>;

const EXTERNAL_CONTACT_IMAGE: Prisma.ContactWhereInput = {
	imageUrl: { not: null },
	NOT: { imageUrl: { contains: BLOB_HOST_SUFFIX } },
};

const EXTERNAL_USER_IMAGE: Prisma.UserWhereInput = {
	image: { not: null },
	NOT: { image: { contains: BLOB_HOST_SUFFIX } },
};

export type ImageMirrorResult = {
	scanned: number;
	copied: number;
};

@Injectable()
export class ImageMirrorService {
	private readonly logger = new Logger(ImageMirrorService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async sweep(): Promise<ImageMirrorResult> {
		if (!blobEnabled()) return { scanned: 0, copied: 0 };

		const results = [
			await this.sweepCompanies(),
			await this.sweepContacts(),
			await this.sweepUsers(),
		];

		const total = results.reduce(
			(sum, result) => ({
				scanned: sum.scanned + result.scanned,
				copied: sum.copied + result.copied,
			}),
			{ scanned: 0, copied: 0 },
		);

		if (total.copied > 0) {
			this.logger.log({ message: "Mirrored external images", ...total });
		}

		return total;
	}

	private async sweepCompanies(): Promise<ImageMirrorResult> {
		const rows = await this.db.company.findMany({
			where: {
				OR: COMPANY_IMAGE_FIELDS.map(externalCompanyImage),
			},
			orderBy: { createdAt: "asc" },
			take: MAX_PER_SWEEP,
			select: {
				id: true,
				logoUrl: true,
				logoDarkUrl: true,
				iconUrl: true,
				iconDarkUrl: true,
			},
		});

		let copied = 0;

		for (const row of rows) {
			const data: Prisma.CompanyUpdateInput = {};

			for (const field of COMPANY_IMAGE_FIELDS) {
				const current = row[field];
				if (!current) continue;

				const stored = await mirror(current, `companies/${row.id}/${field}`);
				if (!stored || stored === current) continue;

				data[field] = stored;
				copied += 1;
			}

			if (Object.keys(data).length === 0) continue;

			await this.db.company.updateMany({
				where: { id: row.id, ...unchanged(row) },
				data,
			});
		}

		return { scanned: rows.length, copied };
	}

	private async sweepContacts(): Promise<ImageMirrorResult> {
		const rows = await this.db.contact.findMany({
			where: EXTERNAL_CONTACT_IMAGE,
			orderBy: { createdAt: "asc" },
			take: MAX_PER_SWEEP,
			select: { id: true, imageUrl: true },
		});

		let copied = 0;

		for (const row of rows) {
			if (!row.imageUrl) continue;

			const stored = await mirror(row.imageUrl, `contacts/${row.id}`);
			if (!stored || stored === row.imageUrl) continue;

			const { count } = await this.db.contact.updateMany({
				where: { id: row.id, imageUrl: row.imageUrl },
				data: { imageUrl: stored },
			});

			copied += count;
		}

		return { scanned: rows.length, copied };
	}

	private async sweepUsers(): Promise<ImageMirrorResult> {
		const rows = await this.db.user.findMany({
			where: EXTERNAL_USER_IMAGE,
			take: MAX_PER_SWEEP,
			select: { id: true, image: true },
		});

		let copied = 0;

		for (const row of rows) {
			if (!row.image) continue;

			const stored = await mirror(row.image, `users/${row.id}/avatar`);
			if (!stored || stored === row.image) continue;

			const { count } = await this.db.user.updateMany({
				where: { id: row.id, image: row.image },
				data: { image: stored },
			});

			copied += count;
		}

		return { scanned: rows.length, copied };
	}
}

function externalCompanyImage(
	field: CompanyImageField,
): Prisma.CompanyWhereInput {
	const mirrored: Prisma.CompanyWhereInput = {};
	mirrored[field] = { contains: BLOB_HOST_SUFFIX };

	const where: Prisma.CompanyWhereInput = { NOT: mirrored };
	where[field] = { not: null };

	return where;
}

function unchanged(row: CompanyImageRow): Prisma.CompanyWhereInput {
	const where: Prisma.CompanyWhereInput = {};
	for (const field of COMPANY_IMAGE_FIELDS) where[field] = row[field] ?? null;

	return where;
}
