import { ensureOfficialOAuthClient } from "@crm/auth";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";

@Injectable()
export class OAuthBootstrapService implements OnModuleInit {
	private readonly logger = new Logger(OAuthBootstrapService.name);

	async onModuleInit(): Promise<void> {
		await ensureOfficialOAuthClient();
		this.logger.log({ message: "Official OAuth client reconciled" });
	}
}
