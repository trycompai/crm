import { z } from "zod";
import { QUICKBOOKS, type QuickBooksConfig } from "./quickbooks-config";

export const quickBooksTokens = z.object({
	accessToken: z.string().min(1),
	refreshToken: z.string().min(1),
});

export type QuickBooksTokens = z.infer<typeof quickBooksTokens>;

export type QuickBooksGrant = {
	realmId: string;
	environment: string;
	verified: boolean;
	tokens: QuickBooksTokens;
};

export type QuickBooksStore = {
	read: () => Promise<QuickBooksGrant>;
	rotate: (
		accessToken: string,
		refresh: (grant: QuickBooksGrant) => Promise<QuickBooksTokens>,
	) => Promise<QuickBooksGrant>;
};

export type QuickBooksFetch = (
	url: string,
	init: RequestInit,
) => Promise<Response>;

const tokenResponse = z.object({
	access_token: z.string().min(1),
	refresh_token: z.string().min(1),
	token_type: z.string().regex(/^bearer$/i),
	expires_in: z.number().positive(),
});

const entityId = z.string().regex(/^\d+$/);

export const quickBooksReadInput = z.object({
	entity: z.enum(["customer", "item", "estimate"]),
	id: entityId,
});

export const quickBooksEstimateInput = z.object({
	customerId: entityId,
	lines: z
		.array(
			z.object({
				itemId: entityId,
				amount: z.number().finite().positive(),
				description: z.string().max(4000),
			}),
		)
		.min(1)
		.max(100),
});

const entityResponse = z.object({
	Id: entityId,
	DisplayName: z.string().optional(),
	Name: z.string().optional(),
	DocNumber: z.string().optional(),
	TxnStatus: z.string().optional(),
	TotalAmt: z.number().optional(),
});

export const quickBooksCompany = z.object({
	CompanyInfo: z.object({ Id: entityId, CompanyName: z.string() }),
});

export class QuickBooksClient {
	constructor(
		private readonly config: QuickBooksConfig,
		private readonly store: QuickBooksStore,
		private readonly fetcher: QuickBooksFetch = fetch,
	) {}

	private assertGrant(grant: QuickBooksGrant): void {
		if (
			!grant.verified ||
			grant.realmId !== this.config.realmId ||
			grant.environment !== this.config.environment
		) {
			throw new Error(
				"QuickBooks enrollment is unverified or does not match this deployment.",
			);
		}
	}

	private async send(url: string, init: RequestInit): Promise<Response> {
		try {
			return await this.fetcher(url, {
				...init,
				redirect: "error",
				signal: AbortSignal.timeout(QUICKBOOKS.requestTimeoutMs),
			});
		} catch {
			throw new Error(
				"QuickBooks request did not complete. Check the service before retrying.",
			);
		}
	}

	private async refresh(grant: QuickBooksGrant): Promise<QuickBooksTokens> {
		this.assertGrant(grant);
		const response = await this.send(QUICKBOOKS.tokenUrl, {
			method: "POST",
			headers: {
				Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`,
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: grant.tokens.refreshToken,
			}).toString(),
		});
		if (!response.ok) {
			throw new Error(
				`QuickBooks refresh failed (${response.status}). Owner re-enrollment is required.`,
			);
		}
		const parsed = tokenResponse.safeParse(
			await response.json().catch(() => null),
		);
		if (!parsed.success)
			throw new Error("QuickBooks returned an invalid token response.");
		return {
			accessToken: parsed.data.access_token,
			refreshToken: parsed.data.refresh_token,
		};
	}

	private async request(path: string, init: RequestInit): Promise<Response> {
		let grant = await this.store.read();
		this.assertGrant(grant);
		const url = `${QUICKBOOKS.hosts[this.config.environment]}/v3/company/${this.config.realmId}/${path}`;
		const send = () =>
			this.send(url, {
				...init,
				headers: {
					Authorization: `Bearer ${grant.tokens.accessToken}`,
					Accept: "application/json",
					"Content-Type": "application/json",
				},
			});
		let response = await send();
		if (response.status === 401) {
			await response.body?.cancel();
			grant = await this.store.rotate(grant.tokens.accessToken, (current) =>
				this.refresh(current),
			);
			this.assertGrant(grant);
			response = await send();
		}
		if (!response.ok)
			throw new Error(
				`QuickBooks request failed (${response.status}). No automatic retry remains.`,
			);
		return response;
	}

	async read(input: z.infer<typeof quickBooksReadInput>) {
		const { entity, id } = quickBooksReadInput.parse(input);
		const response = await this.request(`${entity}/${id}`, { method: "GET" });
		const schema = z.object({
			Customer: entityResponse.optional(),
			Item: entityResponse.optional(),
			Estimate: entityResponse.optional(),
		});
		const parsed = schema.safeParse(await response.json().catch(() => null));
		if (!parsed.success)
			throw new Error("QuickBooks returned an invalid entity response.");
		const result = {
			customer: parsed.data.Customer,
			item: parsed.data.Item,
			estimate: parsed.data.Estimate,
		}[entity];
		if (!result || result.Id !== id)
			throw new Error("QuickBooks returned a different entity.");
		return result;
	}

	async createEstimate(
		input: z.infer<typeof quickBooksEstimateInput>,
		requestId: string,
	) {
		const { customerId, lines } = quickBooksEstimateInput.parse(input);
		const id = z
			.string()
			.regex(/^[a-f0-9]{40}$/)
			.parse(requestId);
		const response = await this.request(`estimate?requestid=${id}`, {
			method: "POST",
			body: JSON.stringify({
				CustomerRef: { value: customerId },
				TxnStatus: "Pending",
				EmailStatus: "NotSet",
				Line: lines.map((line) => ({
					Amount: line.amount,
					Description: line.description,
					DetailType: "SalesItemLineDetail",
					SalesItemLineDetail: { ItemRef: { value: line.itemId } },
				})),
			}),
		});
		const parsed = z
			.object({ Estimate: entityResponse })
			.safeParse(await response.json().catch(() => null));
		if (!parsed.success)
			throw new Error(
				"QuickBooks returned an invalid estimate response. Check QuickBooks before creating another draft.",
			);
		return parsed.data.Estimate;
	}
}
