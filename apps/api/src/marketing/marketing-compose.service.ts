import type { Db } from "@crm/db";
import { readMarketingSettings } from "@crm/db/marketing";
import { readWorkspaceIdentity } from "@crm/db/workspace";
import { type MergeContext, renderEmail, type Shell } from "@crm/email";
import { readDocument } from "@crm/email/document";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

export type Composed = {
	subject: string;
	html: string;
	text: string;
	headers: Record<string, string>;
};

@Injectable()
export class MarketingComposeService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	private origin(): string {
		return (process.env.APP_URL ?? "").replace(/\/$/, "");
	}

	async shell(): Promise<Omit<Shell, "unsubscribeUrl"> | null> {
		const [settings, workspace, header, footer] = await Promise.all([
			readMarketingSettings(this.db),
			readWorkspaceIdentity(this.db).catch(() => null),
			this.db.marketingPartial.findFirst({
				where: { kind: "HEADER", isDefault: true, archivedAt: null },
				select: { document: true },
			}),
			this.db.marketingPartial.findFirst({
				where: { kind: "FOOTER", isDefault: true, archivedAt: null },
				select: { document: true },
			}),
		]);

		if (!settings.postalAddress) return null;

		return {
			workspaceName: workspace?.name ?? "",
			logoUrl: settings.logoUrl,
			logoAlt: workspace?.name ?? null,
			brandColor: settings.brandColor,
			postalAddress: settings.postalAddress,
			header: header ? readDocument(header.document) : null,
			footer: footer ? readDocument(footer.document) : null,
		};
	}

	async compose(input: {
		document: unknown;
		subject: string;
		preheader?: string | null;
		token: string;
		context?: MergeContext;
		shellOverride?: { header?: unknown; footer?: unknown };
	}): Promise<Composed | null> {
		const origin = this.origin();
		if (!origin) return null;

		const base = await this.shell();
		if (!base) return null;

		const shell = {
			...base,
			...(input.shellOverride?.header !== undefined && {
				header: readDocument(input.shellOverride.header),
			}),
			...(input.shellOverride?.footer !== undefined && {
				footer: readDocument(input.shellOverride.footer),
			}),
		};

		const unsubscribeUrl = `${origin}/u/${input.token}`;

		const { html, text } = await renderEmail({
			document: input.document,
			preheader: input.preheader,
			shell: { ...shell, unsubscribeUrl },
			context: input.context,
		});

		return {
			subject: input.subject,
			html,
			text,
			headers: {
				"List-Unsubscribe": `<${unsubscribeUrl}>, <${origin}/api/m/u/${input.token}>`,
				"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
			},
		};
	}

	async contextFor(contactId: string | null): Promise<MergeContext> {
		const workspace = await readWorkspaceIdentity(this.db).catch(() => null);
		const base: MergeContext = { workspace: { name: workspace?.name ?? null } };

		if (!contactId) return base;

		const contact = await this.db.contact.findUnique({
			where: { id: contactId },
			select: {
				firstName: true,
				lastName: true,
				email: true,
				title: true,
				company: { select: { name: true, domain: true } },
			},
		});

		if (!contact) return base;

		return {
			...base,
			contact: {
				firstName: contact.firstName,
				lastName: contact.lastName,
				email: contact.email,
				title: contact.title,
			},
			company: contact.company
				? { name: contact.company.name, domain: contact.company.domain }
				: null,
		};
	}
}
