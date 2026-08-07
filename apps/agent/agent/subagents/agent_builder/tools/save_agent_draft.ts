import { defineTool } from "eve/tools";
import { saveBuilderDraft } from "../../../lib/builder-runtime";
import { requireBuilderAttribute } from "../../../lib/session-purpose";
import { builderDraftToolInput, draftInputFromTool } from "../lib/draft-input";
import {
	assertBuilderDraftOpen,
	markBuilderDraftSaveFinished,
} from "../lib/execution-state";

export default defineTool({
	description:
		"Validate and save one immutable agent version for human review. Copy selected CRM records exactly into resources. Put connected read sources only in integrations. This never deploys the agent.",
	inputSchema: builderDraftToolInput,
	async execute(input, ctx) {
		assertBuilderDraftOpen();
		const result = await saveBuilderDraft(
			requireBuilderAttribute(ctx, "conversationId"),
			requireBuilderAttribute(ctx, "userId"),
			draftInputFromTool(input),
		);
		markBuilderDraftSaveFinished(result.saved);
		return result;
	},
});
