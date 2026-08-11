import {
	normalizeExternalHttpUrl,
	normalizeSocialUrl,
	type SocialUrlKind,
} from "@crm/db/external-url";
import { BadRequestException } from "@nestjs/common";

export function externalUrlOrThrow(
	value: string,
	label = "URL",
): string | null {
	const normalized = normalizeExternalHttpUrl(value);
	if (normalized || value.trim() === "") return normalized;
	throw new BadRequestException(`${label} must be a valid http or https URL.`);
}

export function socialUrlOrThrow(
	value: string,
	kind: SocialUrlKind,
	label = "URL",
): string | null {
	const normalized = normalizeSocialUrl(value, kind);
	if (normalized || value.trim() === "") return normalized;
	throw new BadRequestException(`${label} must be a valid ${kind} URL.`);
}
