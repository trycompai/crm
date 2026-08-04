import { createHmac, timingSafeEqual } from "node:crypto";
import {
	BadRequestException,
	Controller,
	Headers,
	Post,
	Req,
	UnauthorizedException,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request } from "express";
import { inboundLead, inboundSuppression } from "./prospecting.contracts";
import { ProspectingService } from "./prospecting.service";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

@Controller("integrations/v1")
export class ProspectingController {
	constructor(private readonly prospecting: ProspectingService) {}

	@Post("leads")
	@AllowAnonymous()
	async ingest(
		@Req() request: Request,
		@Headers("x-crm-timestamp") timestamp: string | undefined,
		@Headers("x-crm-signature") signature: string | undefined,
	) {
		const body = await readBody(request);
		const parsedTimestamp = timestamp ? Number(timestamp) : Number.NaN;
		if (
			!Number.isFinite(parsedTimestamp) ||
			Math.abs(Date.now() - parsedTimestamp) > MAX_CLOCK_SKEW_MS
		) {
			throw new UnauthorizedException("Invalid integration timestamp.");
		}

		let raw: unknown;
		try {
			raw = JSON.parse(body);
		} catch {
			throw new BadRequestException("Invalid JSON.");
		}
		const parsed = inboundLead.safeParse(raw);
		if (!parsed.success) {
			throw new BadRequestException("Invalid lead payload.");
		}
		const input = parsed.data;
		const secret = integrationSecret(input.product);
		if (!secret || !signature) {
			throw new UnauthorizedException("Integration is not configured.");
		}

		const expected = createHmac("sha256", secret)
			.update(`${timestamp}.${body}`)
			.digest("hex");
		if (!constantTimeEqual(expected, signature)) {
			throw new UnauthorizedException("Invalid integration signature.");
		}

		const candidate = await this.prospecting.ingest(input);
		return {
			accepted: true,
			candidateId: candidate.id,
			status: candidate.status,
		};
	}

	@Post("suppressions")
	@AllowAnonymous()
	async suppress(
		@Req() request: Request,
		@Headers("x-crm-timestamp") timestamp: string | undefined,
		@Headers("x-crm-signature") signature: string | undefined,
	) {
		const body = await readBody(request);
		validateTimestamp(timestamp);
		let raw: unknown;
		try {
			raw = JSON.parse(body);
		} catch {
			throw new BadRequestException("Invalid JSON.");
		}
		const parsed = inboundSuppression.safeParse(raw);
		if (!parsed.success)
			throw new BadRequestException("Invalid suppression payload.");
		verifySignature(parsed.data.product, timestamp, signature, body);
		await this.prospecting.ingestSuppression(parsed.data);
		return { accepted: true };
	}
}

function validateTimestamp(timestamp: string | undefined) {
	const parsedTimestamp = timestamp ? Number(timestamp) : Number.NaN;
	if (
		!Number.isFinite(parsedTimestamp) ||
		Math.abs(Date.now() - parsedTimestamp) > MAX_CLOCK_SKEW_MS
	) {
		throw new UnauthorizedException("Invalid integration timestamp.");
	}
}

function verifySignature(
	product: string,
	timestamp: string | undefined,
	signature: string | undefined,
	body: string,
) {
	const secret = integrationSecret(product);
	if (!secret || !signature)
		throw new UnauthorizedException("Integration is not configured.");
	const expected = createHmac("sha256", secret)
		.update(`${timestamp}.${body}`)
		.digest("hex");
	if (!constantTimeEqual(expected, signature)) {
		throw new UnauthorizedException("Invalid integration signature.");
	}
}

function integrationSecret(product: string): string | undefined {
	return process.env[`PROSPECT_INGEST_${product}_SECRET`]?.trim();
}

async function readBody(request: Request): Promise<string> {
	if (Buffer.isBuffer(request.body)) {
		if (request.body.length > MAX_BODY_BYTES)
			throw new BadRequestException("Payload too large.");
		return request.body.toString("utf8");
	}
	if (typeof request.body === "string") {
		if (Buffer.byteLength(request.body) > MAX_BODY_BYTES)
			throw new BadRequestException("Payload too large.");
		return request.body;
	}

	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > MAX_BODY_BYTES)
			throw new BadRequestException("Payload too large.");
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}

function constantTimeEqual(expected: string, supplied: string): boolean {
	const a = Buffer.from(expected);
	const b = Buffer.from(supplied.toLowerCase());
	return a.length === b.length && timingSafeEqual(a, b);
}
