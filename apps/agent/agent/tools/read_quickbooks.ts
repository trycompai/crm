import { defineTool } from "eve/tools";
import { quickBooksReadInput } from "../lib/quickbooks";
import {
	quickBooksClient,
	quickBooksUnavailable,
} from "../lib/quickbooks-runtime";

export default defineTool({
	description:
		"Read a known customer, item, or estimate ID from the owner's enrolled QuickBooks company. No cross-company queries.",
	inputSchema: quickBooksReadInput,
	async execute(input) {
		const client = await quickBooksClient();
		return client ? client.read(input) : quickBooksUnavailable;
	},
});
