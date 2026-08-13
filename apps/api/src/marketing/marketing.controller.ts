import type { IncomingMessage } from "node:http";
import type { Db } from "@crm/db";
import { suppress, unsubscribeByToken } from "@crm/db/marketing";
import {
	Controller,
	ForbiddenException,
	Headers,
	HttpCode,
	Logger,
	Param,
	Post,
	Req,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { MarketingDrainService } from "./marketing-drain.service";
import { ResendService } from "./resend.service";

type WebhookEvent = {
	type: string;
	data?: { email_id?: string; click?: { link?: string } };
};

const EVENT_TYPES: Record<string, string> = {
	"email.delivered": "DELIVERED",
	"email.opened": "OPENED",
	"email.clicked": "CLICKED",
	"email.bounced": "BOUNCED",
	"email.complained": "COMPLAINED",
	"email.delivery_delayed": "DELAYED",
};

async function rawBody(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
}

@Controller("internal/marketing")
export class MarketingDrainController {
	private readonly logger = new Logger(MarketingDrainController.name);
	private readonly cronSecret: string | undefined;
	private readonly agentSecret: string | undefined;

	constructor(
		private readonly drain: MarketingDrainService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.cronSecret = config.get("CRON_SECRET", { infer: true });
		this.agentSecret = config.get("AGENT_BRIDGE_SECRET", { infer: true });
	}

	@Post("drain")
	@HttpCode(200)
	@AllowAnonymous()
	async run(@Headers("authorization") authorization?: string) {
		const allowed = [this.cronSecret, this.agentSecret].filter(Boolean);

		if (allowed.length === 0) {
			this.logger.warn({
				message:
					"Neither CRON_SECRET nor AGENT_BRIDGE_SECRET is set — refusing to run the marketing drain.",
			});
			throw new ServiceUnavailableException();
		}

		const token = authorization?.replace(/^Bearer\s+/i, "");
		if (!token || !allowed.includes(token)) throw new ForbiddenException();

		return this.drain.tick();
	}
}

@Controller("api/m")
export class MarketingPublicController {
	private readonly logger = new Logger(MarketingPublicController.name);

	private readonly webhookSecret: string | undefined;

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly resend: ResendService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.webhookSecret = config.get("RESEND_WEBHOOK_SECRET", { infer: true });
	}

	@Post("u/:token")
	@HttpCode(200)
	@AllowAnonymous()
	async unsubscribe(@Param("token") token: string) {
		const result = await unsubscribeByToken(this.db, token);

		if (result) {
			const send = await this.db.marketingSend.findFirst({
				where: { recipient: { address: result.address } },
				orderBy: { createdAt: "desc" },
				select: { id: true },
			});

			if (send) {
				await this.db.marketingEvent.create({
					data: { sendId: send.id, type: "UNSUBSCRIBED" },
				});
			}
		}

		return {};
	}

	@Post("webhook/resend")
	@HttpCode(200)
	@AllowAnonymous()
	async webhook(
		@Req() req: IncomingMessage,
		@Headers() headers: Record<string, string>,
	) {
		const secret = this.webhookSecret;
		const body = await rawBody(req);

		if (!secret) {
			this.logger.warn({
				message:
					"RESEND_WEBHOOK_SECRET is not set — refusing the delivery webhook.",
			});
			throw new ServiceUnavailableException();
		}

		const client = await this.resend.client();
		if (!client) throw new ServiceUnavailableException();

		let event: WebhookEvent;

		try {
			event = client.webhooks.verify({
				payload: body,
				headers: {
					id: headers["svix-id"] ?? "",
					timestamp: headers["svix-timestamp"] ?? "",
					signature: headers["svix-signature"] ?? "",
				},
				webhookSecret: secret,
			}) as WebhookEvent;
		} catch {
			throw new ForbiddenException();
		}

		const providerId = event.data?.email_id;
		if (!providerId) return {};

		const send = await this.db.marketingSend.findUnique({
			where: { providerId },
			select: { id: true, recipient: { select: { address: true } } },
		});

		if (!send) {
			this.logger.log({
				message: "A delivery event named a send we do not have",
				providerId,
			});
			return {};
		}

		const type = EVENT_TYPES[event.type];
		if (!type) return {};

		await this.db.marketingEvent.create({
			data: {
				sendId: send.id,
				type: type as "DELIVERED",
				url: event.data?.click?.link ?? null,
			},
		});

		if (type === "DELIVERED") {
			await this.db.marketingSend.update({
				where: { id: send.id },
				data: { status: "DELIVERED" },
			});
		}

		if (type === "OPENED") {
			await this.db.marketingSend.updateMany({
				where: { id: send.id, openedAt: null },
				data: { openedAt: new Date() },
			});
		}

		if (type === "CLICKED") {
			await this.db.marketingSend.updateMany({
				where: { id: send.id, clickedAt: null },
				data: { clickedAt: new Date() },
			});
		}

		if (type === "BOUNCED" || type === "COMPLAINED") {
			await this.db.marketingSend.update({
				where: { id: send.id },
				data: { status: type },
			});
			await suppress(
				this.db,
				send.recipient.address,
				type,
				`Resend reported ${event.type}`,
			);
		}

		return {};
	}
}
