import { ProductKey } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { runProspectDiscovery } from "../lib/prospecting";

export default defineTool({
	description:
		"Run one pending daily prospect discovery for a configured product. It stores evidence-backed candidates but never contacts them.",
	inputSchema: z.object({
		productId: z.enum(
			Object.values(ProductKey) as [ProductKey, ...ProductKey[]],
		),
	}),
	async execute({ productId }) {
		return runProspectDiscovery(productId);
	},
});
