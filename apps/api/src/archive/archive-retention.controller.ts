import type { Db } from "@crm/db";
import { readArchiveRetentionDays } from "@crm/db/settings";
import {
	Controller,
	ForbiddenException,
	Get,
	Headers,
	Logger,
	Post,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
	ApiExcludeEndpoint,
	ApiForbiddenResponse,
	ApiHeader,
	ApiOkResponse,
	ApiOperation,
	ApiServiceUnavailableResponse,
	ApiTags,
} from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { CompaniesService } from "../companies/companies.service";
import type { EnvironmentVariables } from "../config/env.validation";
import { ContactsService } from "../contacts/contacts.service";
import { InjectDatabase } from "../database/database.constants";
import { DealsService } from "../deals/deals.service";

const DAY_MS = 24 * 60 * 60_000;

@ApiTags("Internal — Cron")
@ApiHeader({
	name: "authorization",
	description: "`Bearer <CRON_SECRET>`",
	required: true,
})
@ApiForbiddenResponse({ description: "CRON_SECRET did not match." })
@ApiServiceUnavailableResponse({ description: "CRON_SECRET is not set." })
@Controller("internal/archive")
export class ArchiveRetentionController {
	private readonly logger = new Logger(ArchiveRetentionController.name);
	private readonly secret: string | undefined;

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly companies: CompaniesService,
		private readonly contacts: ContactsService,
		private readonly deals: DealsService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("CRON_SECRET", { infer: true });
	}

	@Get("prune")
	@AllowAnonymous()
	@ApiOperation({
		summary: "Purge companies, contacts and deals past the archive window",
	})
	@ApiOkResponse({ description: "The prune ran; per-record-type counts." })
	async pruneViaGet(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	@Post("prune")
	@AllowAnonymous()
	@ApiExcludeEndpoint()
	async pruneViaPost(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	private async run(authorization?: string) {
		if (!this.secret) {
			this.logger.error({
				message: "CRON_SECRET is not set — refusing to run archive pruning.",
			});
			throw new ServiceUnavailableException("Pruning is not configured.");
		}

		if (!timingSafeEquals(authorization ?? "", `Bearer ${this.secret}`)) {
			throw new ForbiddenException();
		}

		const retentionDays = await readArchiveRetentionDays(this.db);
		const before = new Date(Date.now() - retentionDays * DAY_MS);

		const [companies, contacts, deals] = await Promise.all([
			this.companies.purgeExpired(before),
			this.contacts.purgeExpired(before),
			this.deals.purgeExpired(before),
		]);

		this.logger.log({
			message: "Archive retention swept",
			retentionDays,
			companies: companies.succeeded,
			companiesSkipped: companies.skipped,
			contacts: contacts.succeeded,
			contactsSkipped: contacts.skipped,
			deals: deals.succeeded,
			dealsSkipped: deals.skipped,
		});

		return { retentionDays, companies, contacts, deals };
	}
}

function timingSafeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;

	let mismatch = 0;
	for (let index = 0; index < a.length; index += 1) {
		mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}

	return mismatch === 0;
}
