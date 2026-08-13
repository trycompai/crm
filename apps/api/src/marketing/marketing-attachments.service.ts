import type { Db } from "@crm/db";
import { blobEnabled, putBytes } from "@crm/db/blob";
import { MARKETING } from "@crm/db/marketing";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

@Injectable()
export class MarketingAttachmentsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	available(): boolean {
		return blobEnabled();
	}

	async list(campaignId: string) {
		return this.db.marketingAttachment.findMany({
			where: { campaignId },
			select: {
				id: true,
				filename: true,
				mimeType: true,
				bytes: true,
				url: true,
			},
			orderBy: { createdAt: "asc" },
		});
	}

	async add(input: {
		campaignId: string;
		filename: string;
		mimeType: string;
		contentBase64: string;
		userId: string;
	}) {
		if (!blobEnabled()) {
			throw new BadRequestException(
				"This install has no blob storage, so it cannot hold attachments.",
			);
		}

		const bytes = Buffer.from(input.contentBase64, "base64");

		const existing = await this.db.marketingAttachment.aggregate({
			where: { campaignId: input.campaignId },
			_sum: { bytes: true },
		});

		const total = (existing._sum.bytes ?? 0) + bytes.byteLength;

		if (total > MARKETING.attachments.totalBytes) {
			throw new BadRequestException(
				"Attachments come to more than 40 MB, which Resend refuses.",
			);
		}

		const url = await putBytes(
			bytes,
			input.filename,
			input.mimeType,
			"marketing-attachments",
		);

		if (!url) {
			throw new BadRequestException("That file could not be stored.");
		}

		return this.db.marketingAttachment.create({
			data: {
				campaignId: input.campaignId,
				filename: input.filename,
				mimeType: input.mimeType,
				bytes: bytes.byteLength,
				url,
				uploadedById: input.userId,
			},
			select: { id: true, filename: true, bytes: true, url: true },
		});
	}

	async remove(id: string) {
		await this.db.marketingAttachment.delete({ where: { id } });
		return { id };
	}
}
