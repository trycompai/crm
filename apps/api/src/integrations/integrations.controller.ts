import {
	Body,
	Controller,
	ForbiddenException,
	Headers,
	Post,
	ServiceUnavailableException,
	UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { ZodType } from "zod";
import type { EnvironmentVariables } from "../config/env.validation";
import { claapWebhookInput, clayWebhookInput } from "./integration.contracts";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
export class IntegrationsController {
	private readonly claySecret: string | undefined;
	private readonly claapSecret: string | undefined;

	constructor(
		private readonly integrations: IntegrationsService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.claySecret = config.get("CLAY_WEBHOOK_SECRET", { infer: true });
		this.claapSecret = config.get("CLAAP_WEBHOOK_SECRET", { infer: true });
	}

	@Post("clay")
	@AllowAnonymous()
	clay(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		this.authorize(this.claySecret, bearerToken(authorization));
		return this.integrations.ingestClay(parse(clayWebhookInput, body));
	}

	@Post("claap")
	@AllowAnonymous()
	claap(
		@Headers("x-claap-webhook-secret") secret: string | undefined,
		@Body() body: unknown,
	) {
		this.authorize(this.claapSecret, secret);
		return this.integrations.ingestClaap(parse(claapWebhookInput, body));
	}

	private authorize(
		expected: string | undefined,
		received: string | undefined,
	) {
		if (!expected) {
			throw new ServiceUnavailableException("Integration is not configured.");
		}

		if (!timingSafeEquals(received ?? "", expected)) {
			throw new ForbiddenException();
		}
	}
}

function parse<T>(schema: ZodType<T>, body: unknown): T {
	const result = schema.safeParse(body);
	if (!result.success) {
		throw new UnprocessableEntityException({
			message: "Invalid integration payload.",
			issues: result.error.issues.map(({ path, message }) => ({
				path,
				message,
			})),
		});
	}
	return result.data;
}

function timingSafeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let index = 0; index < a.length; index += 1) {
		mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}
	return mismatch === 0;
}

function bearerToken(authorization: string | undefined): string | undefined {
	return authorization?.startsWith("Bearer ")
		? authorization.slice("Bearer ".length)
		: undefined;
}
