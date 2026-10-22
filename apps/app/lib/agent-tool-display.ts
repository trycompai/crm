import { vendorBySlug } from "@crm/mcp-integrations/catalog";
import type { EveToolInput } from "@crm/validation/eve-tool";
import { z } from "zod";

type ArtifactNames = Record<string, string>;

const ARTIFACT_NAMES: ArtifactNames = {
	"agent/instructions.md": "instructions",
	"agent/manifest.json": "the manifest",
	"agent/README.md": "the readme",
};

type LabelInput = {
	tool: string;
	input: EveToolInput;
	label: string;
	pending: boolean;
};

const MCP_TOOL_NAME = /^([a-z][a-z0-9-]{0,63})__[a-z][a-z0-9_-]{0,127}$/i;
const writeAgentFileInput = z.object({ path: z.string().catch("") }).catch({
	path: "",
});
const connectionExecuteInput = z.object({
	connection: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
	tool: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,127}$/),
});

export function toolLabel(item: LabelInput): string {
	const match = MCP_TOOL_NAME.exec(item.tool);
	if (match) {
		const vendor = vendorBySlug(match[1]?.toLowerCase() ?? "");
		if (!vendor) {
			return item.pending ? "Using a connected tool" : "Used a connected tool";
		}

		return item.pending ? `Using ${vendor.name}` : `Used ${vendor.name}`;
	}

	if (item.tool === "write_agent_file") {
		const path = writeAgentFileInput.parse(item.input).path;
		const name = ARTIFACT_NAMES[path] ?? "a file";
		return item.pending ? `Writing ${name}` : `Wrote ${name}`;
	}

	if (item.tool === "connection_execute") {
		const input = connectionExecuteInput.safeParse(item.input);
		const vendor = input.success
			? vendorBySlug(input.data.connection.toLowerCase())
			: null;
		if (!input.success || !vendor) {
			return item.pending ? "Using a connected tool" : "Used a connected tool";
		}

		const action = input.data.tool.replaceAll("_", " ");
		return item.pending
			? `Asking ${vendor.name} to ${action}`
			: `Asked ${vendor.name} to ${action}`;
	}

	if (item.tool === "save_agent_draft") {
		return item.pending ? "Saving draft" : "Saved draft";
	}

	if (item.tool === "set_chat_title") {
		return item.pending ? "Naming this chat" : "Named this chat";
	}

	return item.label;
}
