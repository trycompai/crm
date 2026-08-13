import { z } from "zod";

export const EMAIL_DOCUMENT_LIMITS = {
	inline: { runLength: 5000, url: 2000 },
	label: { button: 120, alt: 300 },
	image: { minWidth: 16, maxWidth: 1200 },
	columns: { min: 2, max: 3, perColumn: 20, nesting: 2 },
	blocks: { perDocument: 200, total: 400 },
} as const;

export const inline = z.object({
	text: z.string().max(EMAIL_DOCUMENT_LIMITS.inline.runLength),
	bold: z.boolean().optional(),
	italic: z.boolean().optional(),
	href: z.string().url().max(EMAIL_DOCUMENT_LIMITS.inline.url).optional(),
});

export type Inline = z.infer<typeof inline>;

const align = z.enum(["left", "center", "right"]);

const heading = z.object({
	type: z.literal("heading"),
	level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
	text: z.array(inline).min(1),
	align: align.optional(),
});

const text = z.object({
	type: z.literal("text"),
	text: z.array(inline).min(1),
	align: align.optional(),
});

const button = z.object({
	type: z.literal("button"),
	label: z.string().trim().min(1).max(EMAIL_DOCUMENT_LIMITS.label.button),
	href: z.string().url().max(EMAIL_DOCUMENT_LIMITS.inline.url),
	align: align.optional(),
});

const image = z.object({
	type: z.literal("image"),
	src: z.string().url().max(EMAIL_DOCUMENT_LIMITS.inline.url),
	alt: z.string().max(EMAIL_DOCUMENT_LIMITS.label.alt),
	width: z
		.number()
		.int()
		.min(EMAIL_DOCUMENT_LIMITS.image.minWidth)
		.max(EMAIL_DOCUMENT_LIMITS.image.maxWidth)
		.optional(),
	href: z.string().url().max(EMAIL_DOCUMENT_LIMITS.inline.url).optional(),
});

const quote = z.object({
	type: z.literal("quote"),
	text: z.array(inline).min(1),
});

const divider = z.object({ type: z.literal("divider") });

const spacer = z.object({
	type: z.literal("spacer"),
	size: z.enum(["sm", "md", "lg"]),
});

export type Block =
	| z.infer<typeof heading>
	| z.infer<typeof text>
	| z.infer<typeof button>
	| z.infer<typeof image>
	| z.infer<typeof quote>
	| z.infer<typeof divider>
	| z.infer<typeof spacer>
	| { type: "columns"; columns: Block[][] };

const leafBlock = z.discriminatedUnion("type", [
	heading,
	text,
	button,
	image,
	quote,
	divider,
	spacer,
]);

function blockWithin(nesting: number): z.ZodType<Block> {
	if (nesting <= 0) return leafBlock;

	return z.discriminatedUnion("type", [
		heading,
		text,
		button,
		image,
		quote,
		divider,
		spacer,
		z.object({
			type: z.literal("columns"),
			columns: z
				.array(
					z
						.array(blockWithin(nesting - 1))
						.max(EMAIL_DOCUMENT_LIMITS.columns.perColumn),
				)
				.min(EMAIL_DOCUMENT_LIMITS.columns.min)
				.max(EMAIL_DOCUMENT_LIMITS.columns.max),
		}),
	]);
}

export const block: z.ZodType<Block> = blockWithin(
	EMAIL_DOCUMENT_LIMITS.columns.nesting,
);

export const emailDocument = z
	.object({
		version: z.literal(1),
		blocks: z.array(block).max(EMAIL_DOCUMENT_LIMITS.blocks.perDocument),
	})
	.superRefine((value, context) => {
		let total = 0;
		walkBlocks(value.blocks, () => {
			total += 1;
		});

		if (total > EMAIL_DOCUMENT_LIMITS.blocks.total) {
			context.addIssue({
				code: "custom",
				path: ["blocks"],
				message: `This email holds ${total} blocks. The limit is ${EMAIL_DOCUMENT_LIMITS.blocks.total}.`,
			});
		}
	});

export type EmailDocument = z.infer<typeof emailDocument>;

export const EMPTY_DOCUMENT: EmailDocument = { version: 1, blocks: [] };

export function parseDocument(value: unknown): EmailDocument {
	const parsed = emailDocument.safeParse(value);

	if (!parsed.success) {
		const first = parsed.error.issues[0];
		throw new Error(
			`This email document cannot be read: ${first?.path.join(".") ?? "document"} — ${first?.message ?? "unknown problem"}`,
		);
	}

	return parsed.data;
}

export type DocumentProblem = { path: string; message: string };

export function documentProblems(value: unknown): DocumentProblem[] {
	const parsed = emailDocument.safeParse(value);
	if (parsed.success) return [];

	return parsed.error.issues.map((issue) => ({
		path: issue.path.length > 0 ? issue.path.join(".") : "document",
		message: issue.message,
	}));
}

export const BLOCK_SHAPES = {
	heading:
		'{ "type": "heading", "level": 1 | 2 | 3, "text": [{ "text": "…" }] }',
	text: '{ "type": "text", "text": [{ "text": "…" }] }',
	button: '{ "type": "button", "label": "…", "href": "https://…" }',
	image: '{ "type": "image", "src": "https://…", "alt": "…", "width": 160 }',
	quote: '{ "type": "quote", "text": [{ "text": "…" }] }',
	divider: '{ "type": "divider" }',
	spacer: '{ "type": "spacer", "size": "sm" | "md" | "lg" }',
	columns:
		'{ "type": "columns", "columns": [ [ …blocks… ], [ …blocks… ] ] } — 2 or 3 arrays of blocks, nested at most twice.',
	document: '{ "version": 1, "blocks": [ … ] }',
	inline:
		'Every "text" field is an ARRAY of runs, not a string: [{ "text": "Hi" }, { "text": "there", "bold": true }]. A run may carry bold, italic, href.',
} as const;

export function readDocument(value: unknown): EmailDocument | null {
	const parsed = emailDocument.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export function plainTextOf(inlines: Inline[]): string {
	return inlines.map((run) => run.text).join("");
}

export function walkBlocks(
	blocks: Block[],
	visit: (block: Block) => void,
): void {
	for (const item of blocks) {
		visit(item);
		if (item.type === "columns") {
			for (const column of item.columns) walkBlocks(column, visit);
		}
	}
}
