import { SESSION_COOKIE_NAME } from "@crm/auth";
import { Controller, Get } from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiCookieAuth,
	ApiOkResponse,
	ApiOperation,
	ApiSecurity,
	ApiTags,
	ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { OptionalAuth } from "@thallesp/nestjs-better-auth";
import { AuthService } from "./auth.service";
import type { RequestPrincipal } from "./request-principal";
import { Principal } from "./request-principal.decorator";

@ApiTags("Auth")
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiSecurity("apiKey")
@ApiBearerAuth("oauth")
@Controller("auth")
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Get("me")
	@ApiOperation({ summary: "Get the signed-in user's profile" })
	@ApiOkResponse({ description: "The signed-in user's profile." })
	@ApiUnauthorizedResponse({ description: "No valid session." })
	async getMe(@Principal() principal: RequestPrincipal) {
		return { user: await this.authService.getProfile(principal.user.id) };
	}

	@Get("session")
	@OptionalAuth()
	@ApiOperation({
		summary: "Check whether the current request carries a valid session",
	})
	@ApiOkResponse({
		description: "Whether the request is authenticated, and as whom.",
	})
	getSession(@Principal() principal: RequestPrincipal | null) {
		if (!principal) {
			return { authenticated: false, user: null };
		}

		return {
			authenticated: true,
			user: { id: principal.user.id, email: principal.user.email },
			expiresAt: principal.expiresAt,
		};
	}
}
