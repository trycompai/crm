import type { Db, Prisma } from "@crm/db";
import { blobEnabled, putBytes } from "@crm/db/blob";
import { MARKETING, readMarketingSettings } from "@crm/db/marketing";
import { readWorkspaceIdentity } from "@crm/db/workspace";
import {
	EMPTY_DOCUMENT,
	emailDocument,
	lintEmail,
	readDocument,
	walkBlocks,
} from "@crm/email";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { blankToNull } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { type ListInput, paginate, resolveOrderBy } from "../trpc/list-input";
import { MarketingComposeService } from "./marketing-compose.service";

const GLYPH_LINES = 4;

const IMAGE_SIGNATURES = {
	"image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
	"image/jpeg": [0xff, 0xd8, 0xff],
	"image/gif": [0x47, 0x49, 0x46, 0x38],
} as const;

type EmailImageType = keyof typeof IMAGE_SIGNATURES;

const EMAIL_IMAGE_TYPES = new Set<string>(Object.keys(IMAGE_SIGNATURES));

function isEmailImageType(type: string): type is EmailImageType {
	return EMAIL_IMAGE_TYPES.has(type);
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeBase64(content: string): Buffer | null {
	const compact = content.replace(/\s+/g, "");
	if (compact.length === 0 || compact.length % 4 !== 0) return null;
	if (!BASE64.test(compact)) return null;

	return Buffer.from(compact, "base64");
}

function matchesSignature(bytes: Buffer, type: EmailImageType): boolean {
	const signature = IMAGE_SIGNATURES[type];
	if (bytes.byteLength < signature.length) return false;

	return signature.every((byte, at) => bytes[at] === byte);
}

const UNREADABLE_EMAIL =
	"That email content cannot be read, so nothing can be previewed or sent. Undo the last change, or start the body again.";

const UNREADABLE_SHELL =
	"That shell content cannot be read, so nothing can be previewed. Undo the last change, or start the header or footer again.";

const SHELL_PREVIEW_BODY = {
	version: 1,
	blocks: [
		{
			type: "heading",
			level: 2,
			text: [{ text: "The body of the email goes here" }],
		},
		{
			type: "text",
			text: [
				{
					text: "This is a stand-in so you can see the header and the footer around it. Every template wears them, and a campaign node cannot change them.",
				},
			],
		},
	],
};

export type TemplateGlyph = { accent: boolean; lines: number };

function glyphOf(document: unknown): TemplateGlyph {
	const parsed = readDocument(document);
	if (!parsed) return { accent: false, lines: 1 };

	let accent = false;
	let lines = 0;

	walkBlocks(parsed.blocks, (block) => {
		if (block.type === "button" || block.type === "image") accent = true;
		if (block.type === "heading" || block.type === "text") lines += 1;
	});

	return { accent, lines: Math.max(1, Math.min(GLYPH_LINES, lines)) };
}

@Injectable()
export class MarketingTemplatesService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly compose: MarketingComposeService,
	) {}

	async list(input: ListInput) {
		const where: Prisma.MarketingTemplateWhereInput = {
			archivedAt: null,
			...(input.q && { name: { contains: input.q, mode: "insensitive" } }),
		};

		const orderBy =
			resolveOrderBy<Prisma.MarketingTemplateOrderByWithRelationInput>(
				input,
				{
					name: (dir) => ({ name: dir }),
					updatedAt: (dir) => ({ updatedAt: dir }),
				},
				{ updatedAt: "desc" },
			);

		const [shells, total] = await Promise.all([
			this.db.marketingPartial.findMany({
				where: {
					archivedAt: null,
					...(input.q && { name: { contains: input.q, mode: "insensitive" } }),
				},
				orderBy: [{ kind: "asc" }, { isDefault: "desc" }],
				select: {
					id: true,
					kind: true,
					name: true,
					document: true,
					updatedAt: true,
					_count: { select: { headerFor: true, footerFor: true } },
				},
			}),
			this.db.marketingTemplate.count({ where }),
		]);

		const shellRows = shells.map((shell) => ({
			id: shell.id,
			kind: shell.kind as "HEADER" | "FOOTER",
			name: shell.name,
			subject: null as string | null,
			usedBy: shell._count.headerFor + shell._count.footerFor,
			updatedAt: shell.updatedAt,
			glyph: glyphOf(shell.document),
			errors: 0,
			warnings: 0,
		}));

		const { skip, take } = paginate(input);
		const visibleShells = shellRows.slice(skip, skip + take);
		const templateSkip = Math.max(0, skip - shellRows.length);
		const templateTake = take - visibleShells.length;

		const rows =
			templateTake > 0
				? await this.db.marketingTemplate.findMany({
						where,
						orderBy,
						skip: templateSkip,
						take: templateTake,
						select: {
							id: true,
							name: true,
							subject: true,
							preheader: true,
							document: true,
							updatedAt: true,
							_count: { select: { nodes: true } },
						},
					})
				: [];

		return {
			rows: [
				...visibleShells,
				...rows.map((row) => {
					const findings = lintEmail({
						document: row.document,
						subject: row.subject,
						preheader: row.preheader,
					});

					return {
						id: row.id,
						kind: "TEMPLATE" as "HEADER" | "FOOTER" | "TEMPLATE",
						name: row.name,
						subject: row.subject,
						usedBy: row._count.nodes,
						updatedAt: row.updatedAt,
						glyph: glyphOf(row.document),
						errors: findings.filter((finding) => finding.level === "error")
							.length,
						warnings: findings.filter((finding) => finding.level === "warning")
							.length,
					};
				}),
			],
			total: shellRows.length + total,
			facetCounts: {},
		};
	}

	async shellById(id: string) {
		const row = await this.db.marketingPartial.findUnique({
			where: { id },
			select: {
				id: true,
				kind: true,
				name: true,
				document: true,
				isDefault: true,
				updatedAt: true,
				_count: { select: { headerFor: true, footerFor: true } },
			},
		});

		if (!row) return null;

		const [settings, workspace] = await Promise.all([
			readMarketingSettings(this.db),
			readWorkspaceIdentity(this.db).catch(() => null),
		]);

		return {
			id: row.id,
			kind: row.kind,
			name: row.name,
			document: readDocument(row.document),
			isDefault: row.isDefault,
			usedBy: row._count.headerFor + row._count.footerFor,
			updatedAt: row.updatedAt,
			brandLine: {
				logoUrl: settings.logoUrl,
				workspaceName: workspace?.name ?? null,
				brandColor: settings.brandColor,
			},
		};
	}

	async byId(id: string) {
		const row = await this.db.marketingTemplate.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				subject: true,
				preheader: true,
				document: true,
				headerId: true,
				footerId: true,
				updatedAt: true,
				_count: { select: { nodes: true } },
			},
		});

		if (!row) throw new NotFoundException("No such template.");

		return {
			...row,
			document: row.document as Record<string, unknown> | null,
			usedBy: row._count.nodes,
			lint: lintEmail({
				document: row.document,
				subject: row.subject,
				preheader: row.preheader,
			}),
		};
	}

	async uploadImage(input: {
		filename: string;
		mimeType: string;
		contentBase64: string;
	}): Promise<{ url: string }> {
		if (!blobEnabled()) {
			throw new BadRequestException(
				"This install has no blob storage, so it cannot host an image. Paste a URL instead.",
			);
		}

		const type = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";

		if (!isEmailImageType(type)) {
			throw new BadRequestException(
				`Use a PNG, a JPEG or a GIF. Outlook draws none of the rest, ${type || "that type"} included.`,
			);
		}

		const bytes = decodeBase64(input.contentBase64);

		if (!bytes || bytes.byteLength === 0) {
			throw new BadRequestException(
				"That file is empty, or it is not valid base64. Upload the image again.",
			);
		}

		if (bytes.byteLength > MARKETING.image.maxBytes) {
			const mb = Math.round(MARKETING.image.maxBytes / (1024 * 1024));
			throw new BadRequestException(
				`That image is over ${mb} MB. A big image is slow in a phone inbox, so shrink it first.`,
			);
		}

		if (!matchesSignature(bytes, type)) {
			throw new BadRequestException(
				`That file's content is not ${type}. Export it again as a PNG, a JPEG or a GIF, then upload it.`,
			);
		}

		const url = await putBytes(bytes, input.filename, type, "marketing/images");

		if (!url) {
			throw new BadRequestException(
				"The upload failed. Try again, or paste a URL instead.",
			);
		}

		return { url };
	}

	async create(input: {
		name: string;
		subject?: string;
		preheader?: string | null;
		document?: unknown;
	}) {
		const name = blankToNull(input.name);
		if (!name) throw new BadRequestException("Give the template a name.");

		if (input.document !== undefined) {
			const parsed = emailDocument.safeParse(input.document);
			if (!parsed.success) {
				throw new BadRequestException("That email content cannot be read.");
			}
		}

		return this.db.marketingTemplate.create({
			data: {
				name,
				subject: input.subject ?? "",
				preheader: input.preheader ?? null,
				document: (input.document ?? EMPTY_DOCUMENT) as Prisma.InputJsonValue,
			},
			select: { id: true },
		});
	}

	async update(input: {
		id: string;
		name?: string;
		subject?: string;
		preheader?: string | null;
		document?: unknown;
	}) {
		if (input.document !== undefined) {
			const parsed = emailDocument.safeParse(input.document);
			if (!parsed.success) {
				throw new BadRequestException("That email content cannot be read.");
			}
		}

		return this.db.marketingTemplate.update({
			where: { id: input.id },
			data: {
				...(input.name && { name: input.name }),
				...(input.subject !== undefined && { subject: input.subject }),
				...(input.preheader !== undefined && {
					preheader: input.preheader ? blankToNull(input.preheader) : null,
				}),
				...(input.document !== undefined && {
					document: input.document as Prisma.InputJsonValue,
				}),
			},
			select: { id: true },
		});
	}

	async duplicate(id: string) {
		const source = await this.db.marketingTemplate.findUnique({
			where: { id },
			select: { name: true, subject: true, preheader: true, document: true },
		});

		if (!source) throw new NotFoundException("No such template.");

		return this.db.marketingTemplate.create({
			data: {
				name: `${source.name} copy`,
				subject: source.subject,
				preheader: source.preheader,
				document: source.document as Prisma.InputJsonValue,
			},
			select: { id: true },
		});
	}

	async archive(id: string) {
		return this.db.marketingTemplate.update({
			where: { id },
			data: { archivedAt: new Date() },
			select: { id: true },
		});
	}

	async preview(input: {
		document: unknown;
		subject?: string | null;
		preheader?: string | null;
		contactId?: string | null;
	}) {
		const lint = lintEmail({
			document: input.document,
			subject: input.subject,
			preheader: input.preheader,
		});

		if (!readDocument(input.document)) {
			return {
				html: null,
				text: null,
				subject: input.subject ?? "",
				lint,
				blocked: UNREADABLE_EMAIL,
			};
		}

		const context = await this.compose.contextFor(input.contactId ?? null);

		const composed = await this.compose.compose({
			document: input.document,
			subject: input.subject ?? "",
			preheader: input.preheader,
			token: "preview",
			context,
		});

		if (!composed) {
			return {
				html: null,
				text: null,
				subject: input.subject ?? "",
				lint,
				blocked:
					"Set a postal address in Marketing settings, and APP_URL for this install, before anything can be previewed or sent.",
			};
		}

		return {
			html: composed.html,
			text: composed.text,
			subject: composed.subject,
			lint,
			blocked: null,
		};
	}

	async partials() {
		const rows = await this.db.marketingPartial.findMany({
			where: { archivedAt: null },
			select: {
				id: true,
				kind: true,
				name: true,
				isDefault: true,
				document: true,
			},
			orderBy: [{ kind: "asc" }, { isDefault: "desc" }],
		});

		return rows.map((row) => ({
			...row,
			document: readDocument(row.document),
		}));
	}

	async previewShell(input: { id: string; document?: unknown }) {
		const partial = await this.db.marketingPartial.findUnique({
			where: { id: input.id },
			select: { kind: true, document: true },
		});

		if (!partial) throw new NotFoundException("No such shell.");

		const document = input.document ?? partial.document;

		if (!readDocument(document)) {
			return { html: null, text: null, blocked: UNREADABLE_SHELL };
		}

		const context = await this.compose.contextFor(null);

		const composed = await this.compose.compose({
			document: SHELL_PREVIEW_BODY,
			subject: "What every email wearing this looks like",
			token: "preview",
			context,
			shellOverride:
				partial.kind === "HEADER" ? { header: document } : { footer: document },
		});

		if (!composed) {
			return {
				html: null,
				text: null,
				blocked:
					"Set a postal address in Marketing settings, and APP_URL for this install, before anything can be previewed.",
			};
		}

		return { html: composed.html, text: composed.text, blocked: null };
	}

	async savePartial(input: { id: string; name?: string; document?: unknown }) {
		if (input.document !== undefined) {
			const parsed = emailDocument.safeParse(input.document);
			if (!parsed.success) {
				throw new BadRequestException("That shell content cannot be read.");
			}
		}

		const partial = await this.db.marketingPartial.findUnique({
			where: { id: input.id },
			select: { id: true },
		});

		if (!partial) throw new NotFoundException("No such shell.");

		return this.db.marketingPartial.update({
			where: { id: input.id },
			data: {
				...(input.name && { name: input.name }),
				...(input.document !== undefined && {
					document: input.document as Prisma.InputJsonValue,
				}),
			},
			select: { id: true },
		});
	}

	async options() {
		return this.db.marketingTemplate.findMany({
			where: { archivedAt: null },
			select: { id: true, name: true, subject: true },
			orderBy: { name: "asc" },
		});
	}
}
