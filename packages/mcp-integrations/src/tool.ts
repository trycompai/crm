import { createHash } from "node:crypto";
import { z } from "zod";
import type { Vendor } from "./vendor";

const jsonObject = z.record(z.string(), z.json());

export const mcpToolSchema = z.object({
	name: z.string().trim().min(1),
	description: z.string().optional(),
	inputSchema: jsonObject,
	annotations: jsonObject.optional(),
});

export type McpTool = z.infer<typeof mcpToolSchema>;
export type ToolCallKind = "read" | "change" | "risky";

const sensitiveName =
	/(?:^|[_-])(?:execute|exec|run[_-]sql|sql|queries?|logs?|traces?|secrets?|keys?|tokens?|credentials?|passwords?|connection[_-]string|env|environment[_-]variables?|invoices?|payments?|billing|buy|purchase|attachments?|ssh)(?:[_-]|$)/i;

const changingName =
	/(?:^|[_-])(?:create|update|save|delete|remove|deploy|apply|merge|reset|rebase|pause|restore|set|patch|put|post|edit|start|stop|suspend|restart|promote|rollback|rotate|revoke|enable|disable|invite|grant|add|drop|insert|write|send|submit|purchase|buy|cancel|archive|move|transfer|approve|assign)(?:[_-]|$)/i;

function stableValue(value: z.infer<typeof z.json>): z.infer<typeof z.json> {
	if (Array.isArray(value)) return value.map(stableValue);
	const object = jsonObject.safeParse(value);
	if (!object.success) return value;

	return Object.fromEntries(
		Object.entries(object.data)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, stableValue(item)]),
	);
}

export function toolFingerprint(tool: McpTool): string {
	const stable = stableValue({
		name: tool.name,
		description: tool.description ?? "",
		inputSchema: tool.inputSchema,
		annotations: tool.annotations ?? {},
	});

	return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function classifyTool(
	vendor: Pick<Vendor, "riskyTools">,
	tool: McpTool,
): ToolCallKind {
	if (vendor.riskyTools?.includes(tool.name)) return "risky";
	if (sensitiveName.test(tool.name)) return "risky";

	const readOnly = tool.annotations?.readOnlyHint;
	const destructive = tool.annotations?.destructiveHint;

	if (readOnly === true) {
		return changingName.test(tool.name) ? "risky" : "read";
	}

	if (readOnly === false) {
		return destructive === false ? "change" : "risky";
	}

	return "risky";
}
