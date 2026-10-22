import { type auth } from "@crm/auth/auth";
import { SESSION_COOKIE_NAME } from "@crm/auth/cookies";
import {
	BadRequestException,
	Controller,
	Get,
	Query,
	Res,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { McpConnectionsService } from "./mcp-connections.service";

type CrmSession = UserSession<typeof auth>;

@ApiTags("MCP")
@ApiCookieAuth(SESSION_COOKIE_NAME)
@Controller("api/mcp")
export class McpCallbackController {
	constructor(private readonly connections: McpConnectionsService) {}

	@Get("callback")
	@ApiOperation({ summary: "Complete an MCP OAuth connection" })
	async callback(
		@Session() session: CrmSession,
		@Query("state") state: string | undefined,
		@Query("code") code: string | undefined,
		@Query("iss") issuer: string | undefined,
		@Res() response: Response,
	) {
		if (!state || !code) {
			throw new BadRequestException("The MCP callback is incomplete.");
		}
		try {
			const redirect = await this.connections.callback({
				state,
				code,
				issuer,
				userId: session.user.id,
			});
			response.redirect(303, redirect);
		} catch (error) {
			await this.connections.failCallback(state, session.user.id);
			throw error;
		}
	}
}
