import { defineTool } from "eve/tools";
import { z } from "zod";
import { directParent, getEntity } from "../lib/gleif";

export default defineTool({
	description:
		"Read one legal entity from the public GLEIF register by LEI, with its direct parent when one is registered. Free, no key. Use it to confirm a company's legal name, country and status, or to climb from a subsidiary to the group above it.",
	inputSchema: z.object({
		lei: z.string().trim().length(20),
	}),
	async execute({ lei }) {
		const [entity, parent] = await Promise.all([
			getEntity(lei),
			directParent(lei),
		]);

		if (!entity.ok) return { found: false as const, reason: entity.reason };
		if (!entity.data) {
			return { found: false as const, reason: "No entity holds this LEI." };
		}

		return {
			found: true as const,
			entity: entity.data,
			directParent: parent.ok ? parent.data : null,
			note: parent.ok
				? parent.data
					? undefined
					: "No direct parent is registered. Either it is a group head, or the relationship was never reported."
				: `The parent lookup failed: ${parent.reason}`,
		};
	},
});
