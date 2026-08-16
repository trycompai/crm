import { appUrl } from "@crm/auth/env";
import { db } from "@crm/db";
import {
	Controller,
	Get,
	NotFoundException,
	Query,
	Res,
	UnauthorizedException,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import {
	DEV_SESSION_COOKIE_NAME,
	DEV_SESSION_DAYS,
	verifyDevSessionCookieValue,
} from "./dev-session.util";

@Controller("api/dev")
export class DevSessionController {
	@Get("session-login")
	@AllowAnonymous()
	async sessionLogin(
		@Query("session") session: string | undefined,
		@Res() response: Response,
	) {
		if (process.env.NODE_ENV === "production") {
			throw new NotFoundException();
		}

		const secret = process.env.BETTER_AUTH_SECRET;
		if (!secret) {
			throw new NotFoundException();
		}

		if (!session) {
			throw new UnauthorizedException("Missing session.");
		}

		const token = await verifyDevSessionCookieValue(session, secret);
		const stored = await db.session.findUnique({ where: { token } });
		if (!stored || stored.expiresAt.getTime() <= Date.now()) {
			throw new UnauthorizedException("Session is missing or expired.");
		}

		response.cookie(DEV_SESSION_COOKIE_NAME, decodeURIComponent(session), {
			path: "/",
			httpOnly: true,
			sameSite: "lax",
			secure: false,
			maxAge: DEV_SESSION_DAYS * 24 * 60 * 60 * 1000,
		});
		response.redirect(302, appUrl);
	}
}
