import type { Db } from "@crm/db";
import {
	assertSendable,
	ensureDefaultSegments,
	maskKey,
	queueDirect,
	type ResendConnection,
	readMarketingSettings,
	resendConnection,
	type SetupStep,
	writeMarketingSettings,
} from "@crm/db/marketing";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { BadRequestException, Injectable } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { blankToNull, normalizeEmail } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { MARKETING_LOCKS } from "./marketing-config";
import { MarketingDrainService } from "./marketing-drain.service";
import { underLock } from "./marketing-lock";
import type { DnsRecord } from "./resend.service";
import { ResendService } from "./resend.service";
import { ResendOauthService } from "./resend-oauth.service";

export type MarketingStatus = { onboarded: boolean };

export type MarketingSettingsView = {
	connected: boolean;
	connection: ResendConnection;
	apiKeyMask: string | null;
	sendingDomain: string | null;
	fromName: string | null;
	fromAddress: string | null;
	replyTo: string | null;
	postalAddress: string | null;
	sendsPerMinute: number;
	quietStart: number | null;
	quietEnd: number | null;
	timeZone: string;
	dailyCap: number | null;
	onboardedAt: Date | null;
	sendable: { ok: boolean; missing: SetupStep[] };
};

@Injectable()
export class MarketingSettingsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly resend: ResendService,
		private readonly oauth: ResendOauthService,
		private readonly drain: MarketingDrainService,
		private readonly agent: AgentTriggerService,
	) {}

	async status(): Promise<MarketingStatus> {
		const settings = await readMarketingSettings(this.db);
		return { onboarded: settings.onboardedAt !== null };
	}

	async settings(): Promise<MarketingSettingsView> {
		const [settings, sendable] = await Promise.all([
			readMarketingSettings(this.db),
			assertSendable(this.db),
		]);

		return {
			connected: resendConnection(settings) !== null,
			connection: resendConnection(settings),
			apiKeyMask: maskKey(settings.resendApiKey),
			sendingDomain: settings.sendingDomain,
			fromName: settings.fromName,
			fromAddress: settings.fromAddress,
			replyTo: settings.replyTo,
			postalAddress: settings.postalAddress,
			sendsPerMinute: settings.sendsPerMinute,
			quietStart: settings.quietStart,
			quietEnd: settings.quietEnd,
			timeZone: settings.timeZone,
			dailyCap: settings.dailyCap,
			onboardedAt: settings.onboardedAt,
			sendable: sendable.ok
				? { ok: true, missing: [] }
				: { ok: false, missing: sendable.missing },
		};
	}

	async saveKey(key: string): Promise<{ state: string; message?: string }> {
		const trimmed = blankToNull(key);
		if (!trimmed) throw new BadRequestException("Paste your Resend API key.");

		const check = await this.resend.verifyKey(trimmed);

		if (check.state === "invalid") {
			throw new BadRequestException(
				check.message ?? "Resend does not recognise that key.",
			);
		}

		await writeMarketingSettings(this.db, { resendApiKey: trimmed });
		await this.agent.marketingConnected().catch(() => {});

		return { state: check.state, message: check.message };
	}

	async disconnect(): Promise<void> {
		await this.oauth.disconnect();
		await writeMarketingSettings(this.db, {
			resendApiKey: null,
			resendDomainId: null,
			sendingDomain: null,
		});
	}

	async connectStart(): Promise<{ url: string }> {
		return this.oauth.start(await this.connectReturnPath());
	}

	private async connectReturnPath(): Promise<string> {
		const [settings, workspace] = await Promise.all([
			readMarketingSettings(this.db),
			this.db.organization.findUnique({
				where: { id: WORKSPACE_ID },
				select: { slug: true },
			}),
		]);

		const base = workspace?.slug ? `/${workspace.slug}` : "";

		return settings.onboardedAt
			? `${base}/marketing/settings`
			: `${base}/marketing/setup/connect`;
	}

	async connectFinish(
		code: string,
		state: string,
	): Promise<{ returnTo: string | null }> {
		const finished = await this.oauth.finish(code, state);
		await this.agent.marketingConnected().catch(() => {});
		return finished;
	}

	async abandonConnect(state: string): Promise<{ returnTo: string | null }> {
		return this.oauth.abandon(state);
	}

	async connectDestination(state: string): Promise<string | null> {
		return this.oauth.destination(state);
	}

	async saveIdentity(input: {
		fromName: string;
		fromAddress: string;
		replyTo?: string | null;
		postalAddress: string;
	}): Promise<void> {
		const fromAddress = normalizeEmail(input.fromAddress);
		if (!fromAddress)
			throw new BadRequestException("A from address is required.");

		const postalAddress = blankToNull(input.postalAddress);
		if (!postalAddress) {
			throw new BadRequestException(
				"A postal address is required by law on marketing email.",
			);
		}

		const settings = await readMarketingSettings(this.db);
		const domain = settings.sendingDomain;

		const host = fromAddress.split("@")[1] ?? "";

		if (domain && host !== domain && !host.endsWith(`.${domain}`)) {
			throw new BadRequestException(
				`Resend will only send from ${domain}. Use something@${domain}, or change the sending domain first.`,
			);
		}

		await writeMarketingSettings(this.db, {
			fromName: blankToNull(input.fromName),
			fromAddress,
			replyTo: input.replyTo ? normalizeEmail(input.replyTo) : null,
			postalAddress,
		});
	}

	async saveSending(input: {
		sendsPerMinute: number;
		dailyCap: number | null;
		quietStart: number | null;
		quietEnd: number | null;
		timeZone: string;
	}): Promise<void> {
		await writeMarketingSettings(this.db, {
			sendsPerMinute: input.sendsPerMinute,
			dailyCap: input.dailyCap,
			quietStart: input.quietStart,
			quietEnd: input.quietEnd,
			timeZone: input.timeZone,
		});
	}

	async domain(): Promise<{
		name: string | null;
		status: string;
		records: DnsRecord[];
		openTracking: boolean;
		clickTracking: boolean;
	}> {
		const settings = await readMarketingSettings(this.db);

		if (!settings.resendDomainId) {
			return {
				name: settings.sendingDomain,
				status: "not_started",
				records: [],
				openTracking: false,
				clickTracking: false,
			};
		}

		const state = await this.resend.readDomain(settings.resendDomainId);

		if (!state) {
			return {
				name: settings.sendingDomain,
				status: "unknown",
				records: [],
				openTracking: false,
				clickTracking: false,
			};
		}

		return {
			name: state.name,
			status: state.status,
			records: state.records,
			openTracking: state.openTracking,
			clickTracking: state.clickTracking,
		};
	}

	async domains(): Promise<
		{ id: string; name: string; status: string; selected: boolean }[]
	> {
		const [settings, rows] = await Promise.all([
			readMarketingSettings(this.db),
			this.resend.listDomains(),
		]);

		return rows.map((row) => ({
			...row,
			selected: row.id === settings.resendDomainId,
		}));
	}

	async setDomain(
		name: string,
	): Promise<{ status: string; name: string; exists: boolean }> {
		const host = blankToNull(name)
			?.toLowerCase()
			.replace(/^https?:\/\//, "");
		if (!host) throw new BadRequestException("Enter a domain to send from.");

		const known = await this.resend.listDomains();
		const match = known.find((row) => row.name.toLowerCase() === host);

		if (match) {
			await writeMarketingSettings(this.db, {
				resendDomainId: match.id,
				sendingDomain: match.name,
			});

			return { status: match.status, name: match.name, exists: true };
		}

		return { status: "not_in_resend", name: host, exists: false };
	}

	async useDomain(id: string): Promise<{ status: string; name: string }> {
		const domain = await this.resend.readDomain(id);
		if (!domain) {
			throw new BadRequestException("Resend does not have that domain.");
		}

		await writeMarketingSettings(this.db, {
			resendDomainId: domain.id,
			sendingDomain: domain.name,
		});

		return { status: domain.status, name: domain.name };
	}

	async setTracking(input: {
		openTracking?: boolean;
		clickTracking?: boolean;
	}): Promise<{ openTracking: boolean; clickTracking: boolean }> {
		const settings = await readMarketingSettings(this.db);
		if (!settings.resendDomainId) {
			throw new BadRequestException("Pick a sending domain first.");
		}

		const done = await this.resend.setTracking(settings.resendDomainId, input);

		if (!done) {
			throw new BadRequestException(
				"Resend would not change tracking on that domain.",
			);
		}

		const state = await this.resend.readDomain(settings.resendDomainId);

		return {
			openTracking: state?.openTracking ?? false,
			clickTracking: state?.clickTracking ?? false,
		};
	}

	async verifyDomain(): Promise<{ status: string }> {
		const settings = await readMarketingSettings(this.db);
		if (!settings.resendDomainId) {
			throw new BadRequestException("There is no sending domain to check yet.");
		}

		await this.resend.verifyDomain(settings.resendDomainId);
		const state = await this.resend.readDomain(settings.resendDomainId);

		return { status: state?.status ?? "unknown" };
	}

	async sendTest(userId: string): Promise<{ to: string }> {
		const sendable = await assertSendable(this.db);
		if (!sendable.ok) throw new BadRequestException(sendable.reason);

		if (!(await this.resend.ready())) {
			throw new BadRequestException(
				"Resend is not answering with a usable token. Try the test again in a moment.",
			);
		}

		const user = await this.db.user.findUnique({
			where: { id: userId },
			select: { email: true, name: true },
		});

		if (!user?.email) {
			throw new BadRequestException("Your account has no email address.");
		}

		const template = await this.db.marketingTemplate.findFirst({
			where: { archivedAt: null },
			select: { subject: true, document: true },
			orderBy: { createdAt: "asc" },
		});

		const result = await queueDirect(this.db, {
			address: user.email,
			subject: template?.subject
				? `[test] ${template.subject}`
				: "[test] Your marketing setup works",
			document: template?.document ?? {
				version: 1,
				blocks: [
					{
						type: "heading",
						level: 1,
						text: [{ text: "Your marketing setup works" }],
					},
					{
						type: "text",
						text: [
							{
								text: "This came through the same path a campaign takes — the same renderer, the same footer, the same unsubscribe link. Nothing has gone to a customer.",
							},
						],
					},
				],
			},
			replyTo: user.email,
			requestedById: userId,
			origin: "TEST",
		});

		if (!result.ok) {
			throw new BadRequestException(
				result.reason === "unsubscribed"
					? "You unsubscribed from this workspace's marketing email, so the test cannot go to you."
					: `The test could not be queued: ${result.reason}.`,
			);
		}

		await this.drain.tick();

		const send = await this.db.marketingSend.findUnique({
			where: { id: result.sendId },
			select: { status: true, error: true },
		});

		if (send?.status === "FAILED") {
			throw new BadRequestException(
				send.error ?? "Resend refused the test. Check the key and the domain.",
			);
		}

		return { to: user.email };
	}

	async markOnboarded(): Promise<void> {
		await underLock(this.db, MARKETING_LOCKS.onboarding, async () => {
			await ensureDefaultSegments(this.db);
			await writeMarketingSettings(this.db, { onboardedAt: new Date() });
		});
	}
}
