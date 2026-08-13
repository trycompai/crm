import { defineDynamic, defineInstructions } from "eve/instructions";
import { focusOn, setBudget } from "../lib/focus";
import { sessionPreamble } from "../lib/preamble";
import { RESEARCH_INSTRUCTIONS } from "../lib/research-instructions";
import { attribute, purposeOf } from "../lib/session-purpose";

export default defineDynamic({
	events: {
		"session.started": async (_event, ctx) => {
			const purpose = purposeOf(ctx);
			if (purpose === "builder") {
				return builderInstructions(ctx);
			}

			if (purpose === "team-agent") {
				return defineInstructions({
					markdown: `This is one background run of a deployed team agent. Call agent_runner exactly once and pass the run id from your user message. Do not call research tools or perform work yourself. Relay the specialist's structured factual completion summary. Never claim an external action that the specialist did not log.`,
				});
			}

			const attributes = ctx.session.auth.current?.attributes ?? {};
			const budget = asNumber(attributes.budget);
			const kind = asString(attributes.taskKind);

			if (budget) setBudget(budget);

			const { markdown, focus } = await sessionPreamble(
				{
					contactId: asString(attributes.contactId),
					companyId: asString(attributes.companyId),
					dealId: asString(attributes.dealId),
					campaignId: asString(attributes.campaignId),
					campaignNodeId: asString(attributes.campaignNodeId),
					segmentId: asString(attributes.segmentId),
					templateId: asString(attributes.templateId),
					shellId: asString(attributes.shellId),
				},
				{
					dispatched: Boolean(kind),
					kind,
					reason: asString(attributes.reason),
					budget,
				},
			);

			focusOn({ ...focus, sessionId: ctx.session.id });

			return defineInstructions({
				markdown: `${RESEARCH_INSTRUCTIONS}\n\n${markdown}`,
			});
		},
		"turn.started": (_event, ctx) =>
			purposeOf(ctx) === "builder" ? builderInstructions(ctx) : null,
	},
});

function builderInstructions(ctx: Parameters<typeof purposeOf>[0]) {
	return defineInstructions({
		markdown: builderTaskMarkdown(
			attribute(ctx, "commandType"),
			attribute(ctx, "needsTitle") === "true",
		),
	});
}

export function builderTaskMarkdown(
	commandType: string | null,
	needsTitle = false,
): string {
	const task =
		commandType === "CREATE_AGENT"
			? `This private CRM chat turn is authorized to create or revise an agent. Call agent_builder exactly once and call it immediately; do not ask the user a clarification yourself. Pass the complete request, the conversation's relevant decisions, every tagged resource, and your understanding of any attachment. Do not call research tools or mutate CRM records yourself. The specialist inspects authoritative context, asks any essential clarification directly through ask_question, and returns only when the draft is ready. Never retry agent_builder in the same turn. If the specialist fails, explain that the build could not finish and ask the user to try again instead of delegating again. If the specialist returns draft_ready, relay its concise summary and explain that the draft is ready for human review and is not deployed yet.`
			: `This is a private CRM assistant chat. Answer the user's question directly. Use tagged records as scope and use available read-only CRM and research tools when evidence is needed. Use list_deals for pipeline-wide, open-deal, or inactivity questions and follow its pagination until the requested scope is complete. The chat renders list_deals output as a structured deal list. Do not restate or enumerate individual deal rows in prose, bullets, or tables; the structured list is the sole row-level presentation. Give only a concise synthesis, caveats, and useful next actions after the tool results. If one materially necessary decision is missing, call ask_question with one focused follow-up instead of guessing; do not interrupt for optional detail. Do not call agent_builder, create an agent draft, or mutate CRM records on this turn. Agent creation begins only from an explicit request to create or build one. Be concise, distinguish CRM evidence from inference, and say when the CRM does not contain the answer.`;

	return needsTitle
		? `Before any other work, call set_chat_title once. Summarize the user's first message as a polished title of three to seven words in sentence case. Capture the intent, remove slash-command syntax and filler, and do not use quotation marks or ending punctuation.\n\n${task}`
		: task;
}

function asString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
	const parsed = typeof value === "string" ? Number(value) : value;
	return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}
