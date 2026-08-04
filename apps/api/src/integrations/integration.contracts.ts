import { DealStage } from "@crm/db";
import { z } from "zod";

const optionalText = z.string().trim().min(1).optional();
const email = z
	.string()
	.trim()
	.email()
	.transform((value) => value.toLowerCase());

export const clayWebhookInput = z.object({
	eventId: z.string().trim().min(1),
	ownerEmail: email,
	list: z.object({ id: optionalText, name: optionalText }).optional(),
	campaign: z.object({ id: optionalText, name: optionalText }).optional(),
	company: z.object({
		name: z.string().trim().min(1),
		domain: z.string().trim().min(1),
		website: optionalText,
		industry: optionalText,
		linkedinUrl: optionalText,
	}),
	contact: z.object({
		firstName: z.string().trim().min(1),
		lastName: optionalText,
		email,
		phone: optionalText,
		title: optionalText,
		linkedinUrl: optionalText,
	}),
	opportunity: z
		.object({
			name: z.string().trim().min(1),
			stage: z.nativeEnum(DealStage).optional(),
			amount: z.coerce.number().nonnegative().optional(),
			currency: z.string().trim().length(3).toUpperCase().optional(),
			expectedCloseDate: z.iso.datetime().optional(),
		})
		.optional(),
});

const claapPerson = z.object({
	email,
	name: optionalText,
	attended: z.boolean().optional(),
});

const claapRecording = z
	.object({
		id: z.string().trim().min(1),
		title: z.string().trim().min(1),
		createdAt: z.iso.datetime(),
		url: optionalText,
		recorder: claapPerson,
		meeting: z
			.object({
				startingAt: z.iso.datetime().optional(),
				endingAt: z.iso.datetime().optional(),
				participants: z.array(claapPerson).default([]),
			})
			.optional(),
		crmInfo: z
			.object({ deal: z.object({ id: z.string().trim().min(1) }).optional() })
			.optional(),
		deal: z.object({ id: z.string().trim().min(1) }).optional(),
		keyTakeaways: z
			.array(z.object({ text: z.string(), langIso2: optionalText }))
			.default([]),
		actionItems: z.array(z.unknown()).default([]),
		insightTemplates: z.array(z.unknown()).default([]),
		transcripts: z.array(z.unknown()).default([]),
	})
	.passthrough();

const claapEvent = z.object({
	type: z.enum(["recording_added", "recording_updated"]),
	recording: claapRecording,
});

export const claapWebhookInput = z.union([
	z.object({ eventId: z.string().trim().min(1), event: claapEvent }),
	claapEvent.transform((event) => ({
		eventId: `${event.type}:${event.recording.id}`,
		event,
	})),
]);

export type ClayWebhookInput = z.infer<typeof clayWebhookInput>;
export type ClaapWebhookInput = z.infer<typeof claapWebhookInput>;
