import { type auth, SESSION_COOKIE_NAME } from "@crm/auth";
import {
	Controller,
	Get,
	Param,
	Query,
	Res,
	StreamableFile,
} from "@nestjs/common";
import {
	ApiCookieAuth,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiTags,
} from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { ConversationsService } from "./conversations.service";

type CrmSession = UserSession<typeof auth>;

@ApiTags("Conversations")
@ApiCookieAuth(SESSION_COOKIE_NAME)
@Controller("api/conversations/attachments")
export class ConversationAttachmentsController {
	constructor(private readonly conversations: ConversationsService) {}

	@Get(":id")
	@ApiOperation({ summary: "Download a conversation attachment" })
	@ApiParam({ name: "id", description: "Attachment id." })
	@ApiQuery({
		name: "share",
		required: false,
		description: "Share token, for a link opened outside a session.",
	})
	@ApiOkResponse({ description: "The attachment's raw bytes." })
	async read(
		@Param("id") id: string,
		@Query("share") shareToken: string | undefined,
		@Session() session: CrmSession,
		@Res({ passthrough: true }) response: Response,
	) {
		const attachment = await this.conversations.attachment(
			id,
			session.user.id,
			shareToken,
		);
		const content = Buffer.from(attachment.content);
		const disposition = attachment.previewable ? "inline" : "attachment";
		const mediaType = attachment.previewable
			? attachment.mediaType
			: "application/octet-stream";

		response.setHeader("Cache-Control", "private, no-store");
		response.setHeader("Content-Length", content.byteLength.toString());
		response.setHeader("Content-Type", mediaType);
		response.setHeader(
			"Content-Disposition",
			`${disposition}; filename*=UTF-8''${encodeHeaderValue(attachment.name)}`,
		);
		response.setHeader("X-Content-Type-Options", "nosniff");

		return new StreamableFile(content);
	}
}

function encodeHeaderValue(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}
