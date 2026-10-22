import { McpOAuthClient } from "@crm/auth/mcp-oauth";
import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { McpRouter } from "./mcp.router";
import { McpCallbackController } from "./mcp-callback.controller";
import { McpConnectionsService } from "./mcp-connections.service";
import { McpInternalController } from "./mcp-internal.controller";

@Module({
	imports: [AgentModule, TrpcModule],
	controllers: [McpCallbackController, McpInternalController],
	providers: [McpOAuthClient, McpConnectionsService, McpRouter],
	exports: [McpConnectionsService],
})
export class McpModule {}
