import { defineTool } from "eve/tools";
import { z } from "zod";
import { createField, updateFieldBrief } from "../lib/fields";

export default defineTool({
	description:
		"Add a custom field to a record type, or change what a field's brief tells you to look for. Use it when a rep asks the CRM to start tracking something it has no field for. The brief is the whole instruction you will be working from later, so write it the way you would want to read it.",
	inputSchema: z.object({
		action: z.enum(["create", "update-brief"]),
		entity: z.enum(["COMPANY", "CONTACT", "DEAL"]),
		label: z
			.string()
			.optional()
			.describe("What a rep should see. Required when creating."),
		key: z
			.string()
			.optional()
			.describe("Which field to change. Required when updating a brief."),
		type: z
			.enum([
				"TEXT",
				"LONG_TEXT",
				"NUMBER",
				"DATE",
				"CHECKBOX",
				"SELECT",
				"URL",
				"EMAIL",
				"PHONE",
				"USER",
			])
			.optional()
			.describe("Required when creating."),
		options: z
			.array(z.string())
			.optional()
			.describe("The fixed list, when the type is SELECT."),
		agentBrief: z
			.string()
			.optional()
			.describe(
				"What would count as an answer, and where to look. Empty means you work from the label and type alone.",
			),
		agentFilled: z
			.boolean()
			.optional()
			.describe("False hands the field back to the rep entirely."),
	}),
	async execute(input) {
		if (input.action === "create") {
			if (!input.label || !input.type) {
				return {
					created: false,
					reason: "Creating a field needs both a label and a type.",
				};
			}

			return createField({
				entity: input.entity,
				label: input.label,
				type: input.type,
				options: input.options,
				agentBrief: input.agentBrief,
			});
		}

		if (!input.key) {
			return {
				updated: false,
				reason: "Changing a brief needs the field key.",
			};
		}

		return updateFieldBrief({
			entity: input.entity,
			key: input.key,
			agentBrief: input.agentBrief ?? null,
			agentFilled: input.agentFilled,
		});
	},
});
