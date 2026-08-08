import { createHmac } from "node:crypto";
import {
	Injectable,
	Logger,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";

export type TwilioConfig = {
	accountSid: string;
	authToken: string;
	fromNumber?: string;
	messagingServiceSid?: string;
};

export type TwilioSendResult = {
	sid: string;
	status: string;
};

@Injectable()
export class TwilioClient {
	private readonly logger = new Logger(TwilioClient.name);
	private readonly config: TwilioConfig | null;

	constructor(config: ConfigService<EnvironmentVariables, true>) {
		const accountSid = config.get("TWILIO_ACCOUNT_SID", { infer: true });
		const authToken = config.get("TWILIO_AUTH_TOKEN", { infer: true });
		if (accountSid && authToken) {
			this.config = {
				accountSid,
				authToken,
				fromNumber: config.get("TWILIO_FROM_NUMBER", { infer: true }),
				messagingServiceSid: config.get("TWILIO_MESSAGING_SERVICE_SID", {
					infer: true,
				}),
			};
		} else {
			this.config = null;
		}
	}

	get enabled(): boolean {
		return this.config !== null;
	}

	get fromNumber(): string | undefined {
		return this.config?.fromNumber;
	}

	async send(input: {
		to: string;
		body: string;
		from?: string;
	}): Promise<TwilioSendResult> {
		if (!this.config) {
			throw new ServiceUnavailableException(
				"Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in the root .env.",
			);
		}
		const from = input.from ?? this.config.fromNumber;
		const useService = !from && this.config.messagingServiceSid;
		if (!from && !useService) {
			throw new ServiceUnavailableException(
				"No TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID configured.",
			);
		}

		const params = new URLSearchParams();
		params.set("To", input.to);
		params.set("Body", input.body);
		if (useService && this.config.messagingServiceSid) {
			params.set("MessagingServiceSid", this.config.messagingServiceSid);
		} else if (from) {
			params.set("From", from);
		}

		const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
		const auth = Buffer.from(
			`${this.config.accountSid}:${this.config.authToken}`,
		).toString("base64");

		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: params.toString(),
		});

		if (!res.ok) {
			const text = await res.text();
			this.logger.error({ message: "Twilio send failed", status: res.status });
			throw new Error(`Twilio send failed: ${res.status} ${text}`);
		}
		const json = (await res.json()) as { sid: string; status: string };
		return { sid: json.sid, status: json.status };
	}

	validateSignature(
		signature: string | undefined,
		url: string,
		params: Record<string, string>,
	): boolean {
		if (!signature || !this.config) return false;
		const sortedKeys = Object.keys(params).sort();
		let data = url;
		for (const key of sortedKeys) {
			data += key + params[key];
		}
		const computed = createHmac("sha1", this.config.authToken)
			.update(data, "utf8")
			.digest("base64");
		return computed === signature;
	}
}
