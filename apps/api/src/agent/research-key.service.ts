import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { bridge } from "./bridge";

const VERIFY_TIMEOUT_MS = 20_000;

const verifyAnswer = z
	.object({
		outcome: z.string().nullable().catch(null),
		reason: z.string().nullable().catch(null),
	})
	.catch({ outcome: null, reason: null });

export type KeyCheck =
	| { outcome: "valid" }
	| { outcome: "invalid"; reason: string }
	| { outcome: "unknown"; reason: string };

/**
 * Checking a Context key means calling Context, and a vendor client in this
 * process is the thing `docs/api.md` forbids. So the agent — which owns that
 * client, and the one place that knows a 401 from a 429 — is asked, and this
 * service only carries the question there and the answer back.
 */
@Injectable()
export class ResearchKeyService {
	private readonly logger = new Logger(ResearchKeyService.name);

	async verify(apiKey: string): Promise<KeyCheck> {
		const agent = bridge();

		if (!agent) {
			return {
				outcome: "unknown",
				reason:
					"This install has no AGENT_BRIDGE_SECRET, so nothing can check.",
			};
		}

		try {
			const response = await fetch(agent.url("/internal/crm/verify-key"), {
				method: "POST",
				headers: {
					authorization: `Bearer ${agent.secret}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ apiKey }),
				signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
			});

			if (!response.ok) {
				return this.cannotTell(`The agent answered ${response.status}.`);
			}

			const body = verifyAnswer.parse(await response.json());

			if (body.outcome === "valid") return { outcome: "valid" };

			if (body.outcome === "invalid") {
				return {
					outcome: "invalid",
					reason: body.reason || "Context did not recognise that API key.",
				};
			}

			return this.cannotTell(body.reason ?? "No answer.");
		} catch (error) {
			return this.cannotTell(
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	private cannotTell(reason: string): KeyCheck {
		this.logger.warn({
			message: "Could not check the Context key; saving it unverified",
			reason,
		});

		return { outcome: "unknown", reason };
	}
}
