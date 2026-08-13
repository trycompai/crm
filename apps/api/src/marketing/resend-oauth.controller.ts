import { appUrl } from "@crm/auth";
import { Controller, Get, Logger, Query, Res } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { MarketingSettingsService } from "./marketing-settings.service";

const FAILED_SAFELY =
	"Resend did not finish the sign-in. Try connecting again from Marketing settings.";

function landing(
	returnTo: string | null,
	outcome: "connected" | "failed",
	reason?: string,
): string {
	const query = new URLSearchParams({ resend: outcome });
	if (reason) query.set("reason", reason);

	const path =
		returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

	return `${appUrl.replace(/\/+$/, "")}${path}?${query.toString()}`;
}

@Controller("api/marketing/resend")
export class ResendOauthController {
	private readonly logger = new Logger(ResendOauthController.name);

	constructor(private readonly settings: MarketingSettingsService) {}

	@AllowAnonymous()
	@Get("callback")
	async callback(
		@Query("code") code: string | undefined,
		@Query("state") state: string | undefined,
		@Query("error") error: string | undefined,
		@Query("error_description") description: string | undefined,
		@Res() response: Response,
	): Promise<void> {
		if (error) {
			const abandoned = state
				? await this.settings
						.abandonConnect(state)
						.catch(() => ({ returnTo: null }))
				: { returnTo: null };

			this.logger.warn({
				message: "Resend refused the marketing sign-in",
				reason: description ?? error,
			});

			response.redirect(landing(abandoned.returnTo, "failed", FAILED_SAFELY));
			return;
		}

		if (!code || !state) {
			response.redirect(
				landing(null, "failed", "Resend sent no authorisation code."),
			);
			return;
		}

		const started = await this.settings.connectDestination(state);

		try {
			const { returnTo } = await this.settings.connectFinish(code, state);
			response.redirect(landing(returnTo, "connected"));
		} catch (cause) {
			this.logger.warn({
				message: "Resend did not finish the marketing sign-in",
				reason:
					cause instanceof Error
						? cause.message
						: "Resend refused the sign-in.",
			});

			response.redirect(landing(started, "failed", FAILED_SAFELY));
		}
	}
}
