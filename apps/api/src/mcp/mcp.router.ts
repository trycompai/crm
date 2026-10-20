import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	mcpDisconnectInput,
	mcpDisconnectOutput,
	mcpGetInput,
	mcpGetOutput,
	mcpListOutput,
	mcpReconnectInput,
	mcpReconnectOutput,
	mcpReviewToolsInput,
	mcpReviewToolsOutput,
	mcpStartInput,
	mcpStartOutput,
	mcpToolsInput,
	mcpToolsOutput,
} from "./mcp.contracts";
import { McpConnectionsService } from "./mcp-connections.service";

@Router({ alias: "mcp" })
@UseMiddlewares(AuthMiddleware)
export class McpRouter {
	constructor(private readonly connections: McpConnectionsService) {}

	@Query({
		output: mcpListOutput,
		meta: restMeta("GET", "/mcp/connections", ["MCP"]),
	})
	list(@Ctx() ctx: AuthedTrpcContext) {
		return this.connections.list(ctx.user.id);
	}

	@Query({ input: mcpGetInput, output: mcpGetOutput })
	get(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof mcpGetInput>,
	) {
		return this.connections.get(ctx.user.id, input.platformSlug);
	}

	@Query({ input: mcpToolsInput, output: mcpToolsOutput })
	tools(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof mcpToolsInput>,
	) {
		return this.connections.tools(ctx.user.id, input.platformSlug);
	}

	@Mutation({
		input: mcpStartInput,
		output: mcpStartOutput,
		meta: restMeta("POST", "/mcp/connections/start", ["MCP"]),
	})
	start(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof mcpStartInput>,
	) {
		return this.connections.start(ctx.user.id, input);
	}

	@Mutation({ input: mcpReconnectInput, output: mcpReconnectOutput })
	reconnect(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof mcpReconnectInput>,
	) {
		return this.connections.reconnect(ctx.user.id, input);
	}

	@Mutation({
		input: mcpDisconnectInput,
		output: mcpDisconnectOutput,
		meta: restMeta("DELETE", "/mcp/connections/{platformSlug}", ["MCP"]),
	})
	disconnect(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof mcpDisconnectInput>,
	) {
		return this.connections.disconnect(ctx.user.id, input.platformSlug);
	}

	@Mutation({ input: mcpReviewToolsInput, output: mcpReviewToolsOutput })
	reviewTools(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof mcpReviewToolsInput>,
	) {
		return this.connections.reviewTools(
			ctx.user.id,
			input.platformSlug,
			input.tools,
		);
	}
}
