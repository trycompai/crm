import {
	Body,
	Controller,
	ForbiddenException,
	Headers,
	Logger,
	Post,
	Req,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request } from "express";
import type { EnvironmentVariables } from "../config/env.validation";
import { SmsService } from "./sms.service";
import { TwilioClient } from "./twilio.client";

type TwilioInboundBody = {
	MessageSid?: string;
	From?: string;
	To?: string;
	Body?: string;
	NumMedia?: string;
};

@Controller("internal/sms")
export class SmsController {
	private readonly logger = new Logger(SmsController.name);
	private readonly publicUrl: string | undefined;

	constructor(
		private readonly sms: SmsService,
		private readonly twilio: TwilioClient,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.publicUrl = config.get("API_URL", { infer: true });
	}

	@Post("twilio/inbound")
	@AllowAnonymous()
	async twilioInbound(
		@Headers("x-twilio-signature") signature: string | undefined,
		@Body() body: TwilioInboundBody,
		@Req() req: Request,
	) {
		if (!this.twilio.enabled) {
			throw new ServiceUnavailableException("Twilio is not configured.");
		}
		const url = `${this.publicUrl ?? `${req.protocol}://${req.get("host")}`}/internal/sms/twilio/inbound`;
		const params: Record<string, string> = {};
		for (const [k, v] of Object.entries(body ?? {})) {
			if (typeof v === "string") params[k] = v;
		}
		const valid = this.twilio.validateSignature(signature, url, params);
		if (!valid) {
			this.logger.warn({ message: "Invalid Twilio signature on inbound SMS" });
			throw new ForbiddenException();
		}
		if (!body.MessageSid || !body.From || !body.To || !body.Body) {
			return { ok: true, ignored: "missing-fields" };
		}
		await this.sms.handleInbound({
			messageSid: body.MessageSid,
			from: body.From,
			to: body.To,
			body: body.Body,
		});
		return { ok: true };
	}
}
