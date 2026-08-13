import type { Prisma } from "@crm/db";
import { blobEnabled, mirror } from "@crm/db/blob";
import { COMPANY_IMAGE_FIELDS } from "@crm/db/images";
import { z } from "zod";

const mirrorableUrl = z.string().regex(/\S/).nullable().catch(null);

export async function mirrorBrandImages(
	companyId: string,
	update: Prisma.CompanyUpdateInput,
): Promise<{ update: Prisma.CompanyUpdateInput; mirrored: string[] }> {
	if (!blobEnabled()) return { update, mirrored: [] };

	const mirrored: string[] = [];

	await Promise.all(
		COMPANY_IMAGE_FIELDS.map(async (slot) => {
			const source = mirrorableUrl.parse(update[slot]);
			if (!source) return;

			const stored = await mirror(source, `companies/${companyId}/${slot}`);
			if (!stored || stored === source) return;

			update[slot] = stored;
			mirrored.push(slot);
		}),
	);

	return { update, mirrored };
}
