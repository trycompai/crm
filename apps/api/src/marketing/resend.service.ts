import { createHash } from "node:crypto";
import type { Db } from "@crm/db";
import { readMarketingSettings, resendConnection } from "@crm/db/marketing";
import { Injectable, Logger } from "@nestjs/common";
import { type ErrorResponse, Resend } from "resend";
import { InjectDatabase } from "../database/database.constants";
import { RETRYABLE_STATUS } from "./marketing-config";
import { ResendOauthService } from "./resend-oauth.service";

export type SendOne = {
	to: string;
	fromName?: string | null;
	subject: string;
	html: string;
	text: string;
	replyTo?: string | null;
	headers?: Record<string, string>;
	idempotencyKey?: string;
	attachments?: { filename: string; path: string }[];
};

function fromLine(
	settings: { fromName: string | null; fromAddress: string | null },
	override?: string | null,
): string {
	const address = settings.fromAddress;
	if (!address) return "";

	const name = override?.trim() || settings.fromName;
	return name ? `${name} <${address}>` : address;
}

export type SendOutcome =
	| { ok: true; providerId: string }
	| { ok: false; error: string; retry: boolean };

export type DnsRecord = {
	record: string;
	name: string;
	type: string;
	value: string;
	ttl?: string;
	priority?: number;
	status?: string;
};

export type DomainState = {
	id: string;
	name: string;
	status: string;
	records: DnsRecord[];
	openTracking: boolean;
	clickTracking: boolean;
};

const RETRYABLE_CONFLICT: ErrorResponse["name"] =
	"concurrent_idempotent_requests";

function retryable(error: ErrorResponse | null): boolean {
	if (!error) return true;
	if (error.name === RETRYABLE_CONFLICT) return true;
	return error.statusCode ? RETRYABLE_STATUS.has(error.statusCode) : true;
}

function batchKey(sendIds: string[]): string {
	const digest = createHash("sha256")
		.update([...sendIds].sort().join(","))
		.digest("hex");

	return `batch-send/${digest}`;
}

@Injectable()
export class ResendService {
	private readonly logger = new Logger(ResendService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly oauth: ResendOauthService,
	) {}

	async client(): Promise<Resend | null> {
		const token = await this.oauth.accessToken();
		if (token) return new Resend(token);

		const settings = await readMarketingSettings(this.db);
		return settings.resendApiKey ? new Resend(settings.resendApiKey) : null;
	}

	async ready(): Promise<boolean> {
		return (await this.client()) !== null;
	}

	private clientFor(key: string): Resend {
		return new Resend(key);
	}

	private async noClient(): Promise<SendOutcome> {
		const settings = await readMarketingSettings(this.db);

		if (resendConnection(settings)) {
			return {
				ok: false,
				error:
					"Resend did not hand back a usable token, so this is queued to try again.",
				retry: true,
			};
		}

		return { ok: false, error: "Resend is not connected.", retry: false };
	}

	async verifyKey(
		key: string,
	): Promise<{ state: "valid" | "invalid" | "unknown"; message?: string }> {
		try {
			const result = await this.clientFor(key).domains.list();

			if (result.error) {
				const name = result.error.name ?? "";
				if (
					name.includes("validation") ||
					name.includes("restricted") ||
					name.includes("missing_api_key") ||
					result.error.message?.toLowerCase().includes("api key is invalid")
				) {
					return { state: "invalid", message: result.error.message };
				}
				return { state: "unknown", message: result.error.message };
			}

			return { state: "valid" };
		} catch (error) {
			return {
				state: "unknown",
				message:
					error instanceof Error ? error.message : "Resend did not answer.",
			};
		}
	}

	async listDomains(): Promise<{ id: string; name: string; status: string }[]> {
		const client = await this.client();
		if (!client) return [];

		const result = await client.domains.list();

		if (result.error || !result.data) {
			this.logger.warn({
				message: "Resend would not list the sending domains",
				reason: result.error?.message,
			});
			return [];
		}

		const rows = (result.data as unknown as { data?: unknown[] }).data ?? [];

		return (rows as { id: string; name: string; status: string }[]).map(
			(row) => ({ id: row.id, name: row.name, status: row.status }),
		);
	}

	async setTracking(
		id: string,
		tracking: { openTracking?: boolean; clickTracking?: boolean },
	): Promise<boolean> {
		const client = await this.client();
		if (!client) return false;

		const result = await client.domains.update({ id, ...tracking });

		if (result.error) {
			this.logger.warn({
				message: "Resend would not change the domain's tracking",
				reason: result.error.message,
			});
			return false;
		}

		return true;
	}

	async readDomain(id: string): Promise<DomainState | null> {
		const client = await this.client();
		if (!client) return null;

		const result = await client.domains.get(id);
		if (result.error || !result.data) return null;

		const data = result.data as unknown as {
			id: string;
			name: string;
			status: string;
			records?: DnsRecord[];
			open_tracking?: boolean;
			click_tracking?: boolean;
		};

		return {
			id: data.id,
			name: data.name,
			status: data.status,
			records: data.records ?? [],
			openTracking: data.open_tracking ?? false,
			clickTracking: data.click_tracking ?? false,
		};
	}

	async verifyDomain(id: string): Promise<boolean> {
		const client = await this.client();
		if (!client) return false;

		const result = await client.domains.verify(id);
		return !result.error;
	}

	async sendOne(input: SendOne): Promise<SendOutcome> {
		const client = await this.client();
		if (!client) return this.noClient();

		const settings = await readMarketingSettings(this.db);
		const from = fromLine(settings, input.fromName);

		if (!from) {
			return {
				ok: false,
				error: "No from address is configured.",
				retry: false,
			};
		}

		try {
			const result = await client.emails.send(
				{
					from,
					to: [input.to],
					subject: input.subject,
					html: input.html,
					text: input.text,
					replyTo: input.replyTo ?? settings.replyTo ?? undefined,
					headers: input.headers,
					attachments: input.attachments,
				},
				input.idempotencyKey
					? { idempotencyKey: input.idempotencyKey }
					: undefined,
			);

			if (result.error || !result.data) {
				return {
					ok: false,
					error: result.error?.message ?? "Resend refused the message.",
					retry: retryable(result.error),
				};
			}

			return { ok: true, providerId: result.data.id };
		} catch (error) {
			return {
				ok: false,
				error:
					error instanceof Error ? error.message : "Resend did not answer.",
				retry: true,
			};
		}
	}

	async sendBatch(
		messages: (SendOne & { sendId: string })[],
	): Promise<Map<string, SendOutcome>> {
		const results = new Map<string, SendOutcome>();
		const client = await this.client();

		if (!client) {
			const outcome = await this.noClient();
			for (const message of messages) results.set(message.sendId, outcome);
			return results;
		}

		const settings = await readMarketingSettings(this.db);

		try {
			const result = await client.batch.send(
				messages.map((message) => ({
					from: fromLine(settings, message.fromName),
					to: [message.to],
					subject: message.subject,
					html: message.html,
					text: message.text,
					replyTo: message.replyTo ?? settings.replyTo ?? undefined,
					headers: message.headers,
				})),
				{ idempotencyKey: batchKey(messages.map((message) => message.sendId)) },
			);

			if (result.error || !result.data) {
				const retry = retryable(result.error);

				for (const message of messages) {
					results.set(message.sendId, {
						ok: false,
						error: result.error?.message ?? "Resend refused the batch.",
						retry,
					});
				}
				return results;
			}

			result.data.data.forEach((row, index) => {
				const message = messages[index];
				if (message)
					results.set(message.sendId, { ok: true, providerId: row.id });
			});

			for (const message of messages) {
				if (!results.has(message.sendId)) {
					results.set(message.sendId, {
						ok: false,
						error: "Resend returned no id for this message.",
						retry: true,
					});
				}
			}

			return results;
		} catch (error) {
			const reason =
				error instanceof Error ? error.message : "Resend did not answer.";
			for (const message of messages) {
				results.set(message.sendId, { ok: false, error: reason, retry: true });
			}
			return results;
		}
	}
}
