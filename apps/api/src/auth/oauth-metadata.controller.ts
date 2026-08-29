import { auth, getProtectedResourceMetadata, OAUTH } from "@crm/auth";
import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";

@ApiTags("OAuth")
@AllowAnonymous()
@Controller()
export class OAuthMetadataController {
	@Get(".well-known/oauth-authorization-server/api/auth")
	@ApiOperation({ summary: "Get OAuth authorization-server metadata" })
	@ApiOkResponse({ description: "OAuth authorization-server metadata." })
	getAuthorizationServerMetadata() {
		return auth.api.getOAuthServerConfig();
	}

	@Get(".well-known/oauth-protected-resource/api")
	@ApiOperation({ summary: "Get OAuth protected-resource metadata" })
	@ApiOkResponse({ description: "OAuth protected-resource metadata." })
	getResourceMetadata() {
		return getProtectedResourceMetadata({
			resource: OAUTH.resource,
			authorization_servers: [OAUTH.issuer],
			scopes_supported: [...OAUTH.scopes.crm],
		});
	}
}
