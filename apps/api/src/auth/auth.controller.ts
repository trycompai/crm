import { type auth, isWorkspaceEmail } from "@crm/auth";
import { Controller, Get } from "@nestjs/common";
import {
	OptionalAuth,
	Session,
	type UserSession,
} from "@thallesp/nestjs-better-auth";
import { AuthService } from "./auth.service";

type CrmSession = UserSession<typeof auth>;

@Controller("auth")
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Get("me")
	async getMe(@Session() session: CrmSession) {
		return { user: await this.authService.getProfile(session.user.id) };
	}

	@Get("session")
	@OptionalAuth()
	getSession(@Session() session?: CrmSession) {
		if (!session || !isWorkspaceEmail(session.user.email)) {
			return { authenticated: false, user: null };
		}

		return {
			authenticated: true,
			user: { id: session.user.id, email: session.user.email },
			expiresAt: session.session.expiresAt,
		};
	}
}
