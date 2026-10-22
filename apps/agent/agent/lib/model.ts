import { db } from "@crm/db";
import { DEFAULT_AGENT_MODEL, readAgentModel } from "@crm/db/settings";

export interface ModelSelection {
	model: string;
	modelContextWindowTokens: number;
}

export async function selectedModel(): Promise<ModelSelection> {
	try {
		const setting = await readAgentModel(db);

		return {
			model: setting.id,
			modelContextWindowTokens: setting.contextWindowTokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not read the configured model, falling back: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return {
			model: DEFAULT_AGENT_MODEL.id,
			modelContextWindowTokens: DEFAULT_AGENT_MODEL.contextWindowTokens,
		};
	}
}
