import {
	Controller,
	ForbiddenException,
	Get,
	Headers,
	Logger,
	Param,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { EnvironmentVariables } from "../config/env.validation";
import { McpConnectionsService } from "./mcp-connections.service";

@ApiExcludeController()
@Controller("internal/mcp")
export class McpInternalController {
	private readonly logger = new Logger(McpInternalController.name);
	private readonly secret: string | undefined;

	constructor(
		private readonly connections: McpConnectionsService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("AGENT_BRIDGE_SECRET", { infer: true })?.trim();
	}

	@Get("connections/:connectionId/token")
	@AllowAnonymous()
	async token(
		@Param("connectionId") connectionId: string,
		@Headers("authorization") authorization?: string,
	) {
		if (!this.secret) {
			this.logger.error({ message: "MCP token brokering is not configured." });
			throw new ServiceUnavailableException(
				"MCP token brokering is not configured.",
			);
		}
		if (!timingSafeEquals(authorization ?? "", `Bearer ${this.secret}`)) {
			throw new ForbiddenException();
		}

		return this.connections.token(connectionId);
	}
}

function timingSafeEquals(left: string, right: string): boolean {
	if (left.length !== right.length) return false;

	let mismatch = 0;
	for (let index = 0; index < left.length; index += 1) {
		mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}

	return mismatch === 0;
}
