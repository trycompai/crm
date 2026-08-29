import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthHooksService } from "./auth-hooks.service";
import { OAuthBootstrapService } from "./oauth-bootstrap.service";
import { OAuthMetadataController } from "./oauth-metadata.controller";
import { RequestPrincipalGuard } from "./request-principal.guard";
import { RequestPrincipalService } from "./request-principal.service";

@Global()
@Module({
	controllers: [AuthController, OAuthMetadataController],
	providers: [
		AuthService,
		AuthHooksService,
		OAuthBootstrapService,
		RequestPrincipalService,
		{ provide: APP_GUARD, useClass: RequestPrincipalGuard },
	],
	exports: [AuthService, RequestPrincipalService],
})
export class AuthModule {}
