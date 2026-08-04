import { Module } from "@nestjs/common";
import { TRPCModule } from "nestjs-trpc";
import { ContextLogger } from "../logging/context-logger";
import { formatTrpcError } from "./error-formatter";
import { AuthMiddleware } from "./middlewares/auth.middleware";
import { DomainErrorMiddleware } from "./middlewares/domain-error.middleware";
import { LoggingMiddleware } from "./middlewares/logging.middleware";
import { TrpcContext } from "./trpc.context";
import { TrpcErrorHandler } from "./trpc-error.handler";

@Module({
	imports: [
		TRPCModule.forRoot({
			basePath: "/api/trpc",
			context: TrpcContext,
			logger: new ContextLogger(),
			errorFormatter: formatTrpcError,
			onError: TrpcErrorHandler,
			globalMiddlewares: [LoggingMiddleware, DomainErrorMiddleware],
		}),
	],
	providers: [
		TrpcContext,
		TrpcErrorHandler,
		LoggingMiddleware,
		DomainErrorMiddleware,
		AuthMiddleware,
	],
	exports: [AuthMiddleware],
})
export class TrpcModule {}
