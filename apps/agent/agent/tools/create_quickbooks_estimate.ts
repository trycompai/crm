import { createHash } from "node:crypto";
import { defineTool } from "eve/tools";
import { sensitiveWrite } from "../lib/approval";
import { quickBooksEstimateInput } from "../lib/quickbooks";
import {
	quickBooksClient,
	quickBooksUnavailable,
} from "../lib/quickbooks-runtime";

export default defineTool({
	description:
		"Create an unsent Pending estimate in the owner's enrolled QuickBooks company. Requires human approval for every draft. Never sends email or creates an invoice. Amounts use the company's currency.",
	inputSchema: quickBooksEstimateInput,
	approval: sensitiveWrite(
		"Ask a person to review and approve each QuickBooks estimate draft.",
	),
	async execute(input, ctx) {
		const client = await quickBooksClient();
		if (!client) return quickBooksUnavailable;
		const requestId = createHash("sha256")
			.update(`${ctx.session.id}:${ctx.callId}`)
			.digest("hex")
			.slice(0, 40);
		return client.createEstimate(input, requestId);
	},
});
