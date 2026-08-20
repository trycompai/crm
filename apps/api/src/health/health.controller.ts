import type { Db } from "@crm/db";
import {
	Controller,
	Get,
	Logger,
	ServiceUnavailableException,
} from "@nestjs/common";
import {
	ApiOkResponse,
	ApiOperation,
	ApiServiceUnavailableResponse,
	ApiTags,
} from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { InjectDatabase } from "../database/database.constants";

const SLOW_PROBE_MS = 250;

@ApiTags("Health")
@Controller("health")
export class HealthController {
	private readonly logger = new Logger(HealthController.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	@Get()
	@AllowAnonymous()
	@ApiOperation({ summary: "Report API and database liveness" })
	@ApiOkResponse({
		description: "The API and its database are reachable.",
		schema: { example: { status: "ok", database: "up" } },
	})
	@ApiServiceUnavailableResponse({
		description: "The database did not respond.",
		schema: { example: { status: "error", database: "down" } },
	})
	async check() {
		const startedAt = process.hrtime.bigint();

		try {
			await this.db.$queryRaw`SELECT 1`;
		} catch (error) {
			this.logger.error(
				{ message: "Database health check failed" },
				error instanceof Error ? error.stack : String(error),
			);
			throw new ServiceUnavailableException({
				status: "error",
				database: "down",
			});
		}

		const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

		if (durationMs > SLOW_PROBE_MS) {
			this.logger.warn({
				message: "Database health check was slow",
				durationMs: Number(durationMs.toFixed(1)),
				thresholdMs: SLOW_PROBE_MS,
			});
		}

		return { status: "ok", database: "up" };
	}
}
