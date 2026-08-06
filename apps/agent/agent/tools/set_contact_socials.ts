import { defineTool } from "eve/tools";
import { z } from "zod";
import { personForVerification } from "../lib/crm";
import type { Evidence } from "../lib/evidence";
import { recordFact } from "../lib/facts";
import { focusOn } from "../lib/focus";
import { assertResearchPurpose } from "../lib/session-purpose";
import { parseSocialUrl, verifyGithub, verifyX } from "../lib/socials";

export default defineTool({
	description:
		"Write a contact's X and/or GitHub profile URLs after verifying each one. GitHub is checked against the account's own profile via the GitHub API; X is checked by handle and independent citation. Rejects anything it cannot corroborate — a rejection is a correct outcome, not a problem to work around.",
	inputSchema: z.object({
		contactId: z.string(),
		twitterUrl: z
			.string()
			.optional()
			.describe("A candidate x.com profile URL from find_contact_socials."),
		githubUrl: z
			.string()
			.optional()
			.describe(
				"A candidate github.com profile URL from find_contact_socials.",
			),
	}),
	async execute({ contactId, twitterUrl, githubUrl }, ctx) {
		assertResearchPurpose(ctx);
		focusOn({ contactId });

		const person = await personForVerification(contactId);
		if (!person) {
			return { written: false as const, reason: "No such contact." };
		}

		const rejected: string[] = [];
		const outcomes: {
			field: "twitterUrl" | "githubUrl";
			url: string;
			band: string | null;
			applied: boolean;
		}[] = [];

		const candidates = [
			{ field: "twitterUrl" as const, raw: twitterUrl, network: "x" as const },
			{
				field: "githubUrl" as const,
				raw: githubUrl,
				network: "github" as const,
			},
		];

		for (const candidate of candidates) {
			if (!candidate.raw) continue;

			const parsed = parseSocialUrl(candidate.raw);
			if (parsed?.network !== candidate.network) {
				rejected.push(
					`${candidate.raw} is not a ${candidate.network} profile URL.`,
				);
				continue;
			}

			const verdict =
				candidate.network === "x"
					? await verifyX(parsed, person)
					: await verifyGithub(parsed, person);

			if (!verdict.accepted) {
				rejected.push(verdict.reason);
				continue;
			}

			const result = await recordFact({
				contactId,
				field: candidate.field,
				value: verdict.profile.url,
				evidence: verdict.evidence as Evidence[],
				method: candidate.network === "x" ? "x.handle+citation" : "github.api",
				sourceUrl: verdict.profile.url,
			});

			outcomes.push({
				field: candidate.field,
				url: verdict.profile.url,
				band: result.band,
				applied: result.applied,
			});

			if (!result.stored && result.reason) rejected.push(result.reason);
		}

		return {
			written: outcomes.some((outcome) => outcome.applied),
			outcomes,
			rejected,
			note:
				outcomes.length === 0 && rejected.length > 0
					? "Nothing was written. There is no other route to this write — do not look for one."
					: undefined,
		};
	},
});
