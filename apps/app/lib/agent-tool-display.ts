const ARTIFACT_NAMES: Record<string, string> = {
	"agent/instructions.md": "instructions",
	"agent/manifest.json": "the manifest",
	"agent/README.md": "the readme",
};

type LabelInput = {
	tool: string;
	input: Record<string, unknown> | null;
	label: string;
	pending: boolean;
};

const INPUT_LABELS: Record<
	string,
	(input: Record<string, unknown>, pending: boolean) => string | null
> = {
	write_agent_file: (input, pending) => {
		const path = typeof input.path === "string" ? input.path : null;
		if (!path) return null;
		const name = ARTIFACT_NAMES[path] ?? path;
		return pending ? `Writing ${name}` : `Wrote ${name}`;
	},
	save_agent_draft: (input, pending) => {
		const name = typeof input.name === "string" ? input.name.trim() : "";
		const verb = pending ? "Saving draft" : "Saved draft";
		return name ? `${verb} · ${name}` : verb;
	},
	set_chat_title: (input, pending) => {
		const title = typeof input.title === "string" ? input.title.trim() : "";
		const verb = pending ? "Naming this chat" : "Named this chat";
		return title ? `${verb} · ${title}` : verb;
	},
};

export function toolLabel(item: LabelInput): string {
	const fromInput = item.input
		? INPUT_LABELS[item.tool]?.(item.input, item.pending)
		: null;
	return fromInput ?? item.label;
}
