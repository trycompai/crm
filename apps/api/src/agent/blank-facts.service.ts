import { Injectable, Logger } from "@nestjs/common";
import { bridge } from "./bridge";

const SWEEP_TIMEOUT_MS = 60_000;

export type BlankFactSweep = {
	scanned: number;
	filled: number;
	settled: number;
	waiting: number;
	unscanned: number;
};

const NOTHING: BlankFactSweep = {
	scanned: 0,
	filled: 0,
	settled: 0,
	waiting: 0,
	unscanned: 0,
};

/**
 * Applying a suggestion to a field nobody has filled is the agent's rule, in
 * the agent's code — `fillsBlank` knows what a human owns and what a derived
 * name is, and a second copy of that here is the thing `docs/api.md` forbids.
 * So this asks, and reports what came back.
 */
@Injectable()
export class BlankFactsService {
	private readonly logger = new Logger(BlankFactsService.name);

	async sweep(): Promise<BlankFactSweep> {
		const agent = bridge();
		if (!agent) return NOTHING;

		try {
			const response = await fetch(
				agent.url("/internal/crm/apply-blank-facts"),
				{
					method: "POST",
					headers: { authorization: `Bearer ${agent.secret}` },
					signal: AbortSignal.timeout(SWEEP_TIMEOUT_MS),
				},
			);

			if (!response.ok) {
				this.unreachable(`The agent answered ${response.status}.`);
				return NOTHING;
			}

			return { ...NOTHING, ...((await response.json()) as BlankFactSweep) };
		} catch (error) {
			this.unreachable(error instanceof Error ? error.message : String(error));
			return NOTHING;
		}
	}

	private unreachable(reason: string): void {
		this.logger.warn({
			message: "Could not apply suggestions to empty fields",
			reason,
		});
	}
}
