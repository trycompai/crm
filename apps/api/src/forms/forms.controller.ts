import {
	Body,
	Controller,
	Get,
	Headers,
	Ip,
	NotFoundException,
	Param,
	Post,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { FormsService } from "./forms.service";

type PublicSubmitBody = {
	data?: Record<string, string | number | boolean>;
};

@Controller("public/forms")
export class FormsController {
	constructor(private readonly forms: FormsService) {}

	@Get(":slug")
	@AllowAnonymous()
	async get(@Param("slug") slug: string) {
		const form = await this.forms.bySlug(slug);
		if (!form || form.status !== "PUBLISHED") {
			throw new NotFoundException("Form not found");
		}
		return {
			id: form.id,
			name: form.name,
			slug: form.slug,
			description: form.description,
			submitButtonLabel: form.submitButtonLabel,
			fields: form.fields.map((f) => ({
				key: f.key,
				label: f.label,
				type: f.type,
				required: f.required,
				placeholder: f.placeholder,
				helpText: f.helpText,
				options: f.options,
			})),
		};
	}

	@Post(":slug/submit")
	@AllowAnonymous()
	async submit(
		@Param("slug") slug: string,
		@Body() body: PublicSubmitBody,
		@Ip() ip: string,
		@Headers("user-agent") userAgent?: string,
		@Headers("referer") referrer?: string,
	) {
		return this.forms.publicSubmit({
			slug,
			data: body?.data ?? {},
			ipAddress: ip,
			userAgent,
			referrer,
		});
	}
}
