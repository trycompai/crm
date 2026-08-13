import {
	Body,
	Button,
	Column,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Row,
	render,
	Section,
	Text,
} from "@react-email/components";
import { createElement, type JSX } from "react";
import {
	type Block,
	type EmailDocument,
	type Inline,
	parseDocument,
} from "./document";
import { type MergeContext, resolveMerge } from "./merge";
import {
	EMAIL_CONTENT_WIDTH,
	EMAIL_PADDING_X,
	EMAIL_THEME,
	EMAIL_WIDTH,
} from "./theme";

export type Shell = {
	logoUrl?: string | null;
	logoAlt?: string | null;
	brandColor?: string | null;
	workspaceName: string;
	postalAddress: string;
	unsubscribeUrl: string;
	preferencesUrl?: string | null;
	header?: EmailDocument | null;
	footer?: EmailDocument | null;
};

export type RenderInput = {
	document: unknown;
	preheader?: string | null;
	shell: Shell;
	context?: MergeContext;
};

const ALIGN = { left: "left", center: "center", right: "right" } as const;

const BREAK_LONG_WORDS = { wordBreak: "break-word" } as const;

const MSO_SHELL = {
	open: {
		marker: "<mso-shell-open></mso-shell-open>",
		html: `<!--[if mso]><table role="presentation" align="center" width="${EMAIL_WIDTH}" border="0" cellpadding="0" cellspacing="0"><tr><td><![endif]-->`,
	},
	close: {
		marker: "<mso-shell-close></mso-shell-close>",
		html: "<!--[if mso]></td></tr></table><![endif]-->",
	},
} as const;

function withMsoShell(html: string): string {
	return html
		.replace(MSO_SHELL.open.marker, MSO_SHELL.open.html)
		.replace(MSO_SHELL.close.marker, MSO_SHELL.close.html);
}

function runs(items: Inline[], context: MergeContext): JSX.Element[] {
	return items.map((run, index) => {
		const value = resolveMerge(run.text, context);
		const key = `${index}-${value.slice(0, 12)}`;

		let node: JSX.Element = <span key={key}>{value}</span>;

		if (run.bold) node = <strong key={key}>{value}</strong>;
		if (run.italic)
			node = <em key={key}>{run.bold ? <strong>{value}</strong> : value}</em>;

		if (run.href) {
			return (
				<Link
					key={key}
					href={resolveMerge(run.href, context)}
					style={{ color: EMAIL_THEME.brand, textDecoration: "underline" }}
				>
					{node}
				</Link>
			);
		}

		return node;
	});
}

function renderBlock(
	item: Block,
	index: number,
	context: MergeContext,
	brand: string,
): JSX.Element | null {
	const key = `${item.type}-${index}`;

	switch (item.type) {
		case "heading": {
			const size = item.level === 1 ? 26 : item.level === 2 ? 21 : 17;
			return (
				<Text
					key={key}
					style={{
						margin: "0 0 14px",
						fontSize: `${size}px`,
						lineHeight: `${Math.round(size * 1.32)}px`,
						fontWeight: 600,
						color: EMAIL_THEME.foreground,
						textAlign: ALIGN[item.align ?? "left"],
						...BREAK_LONG_WORDS,
					}}
				>
					{runs(item.text, context)}
				</Text>
			);
		}
		case "text":
			return (
				<Text
					key={key}
					style={{
						margin: "0 0 14px",
						fontSize: "15px",
						lineHeight: "24px",
						color: EMAIL_THEME.body,
						textAlign: ALIGN[item.align ?? "left"],
						...BREAK_LONG_WORDS,
					}}
				>
					{runs(item.text, context)}
				</Text>
			);
		case "button":
			return (
				<Section
					key={key}
					style={{ margin: "0 0 18px", textAlign: ALIGN[item.align ?? "left"] }}
				>
					<Button
						href={resolveMerge(item.href, context)}
						className="box-border"
						style={{
							backgroundColor: brand,
							color: EMAIL_THEME.brandText,
							padding: "12px 20px",
							borderRadius: "5px",
							fontSize: "14px",
							fontWeight: 500,
							textDecoration: "none",
							display: "inline-block",
							boxSizing: "border-box",
							maxWidth: "100%",
							...BREAK_LONG_WORDS,
						}}
					>
						{resolveMerge(item.label, context)}
					</Button>
				</Section>
			);
		case "image": {
			const img = (
				<Img
					src={item.src}
					alt={item.alt}
					width={Math.min(
						item.width ?? EMAIL_CONTENT_WIDTH,
						EMAIL_CONTENT_WIDTH,
					)}
					style={{ maxWidth: "100%", border: "0 none", display: "block" }}
				/>
			);
			return (
				<Section key={key} style={{ margin: "0 0 18px" }}>
					{item.href ? <Link href={item.href}>{img}</Link> : img}
				</Section>
			);
		}
		case "quote":
			return (
				<Section
					key={key}
					style={{
						margin: "0 0 18px",
						padding: "2px 0 2px 14px",
						borderLeft: `3px solid ${EMAIL_THEME.border}`,
					}}
				>
					<Text
						style={{
							margin: "0",
							fontSize: "15px",
							lineHeight: "24px",
							color: EMAIL_THEME.muted,
							fontStyle: "italic",
							...BREAK_LONG_WORDS,
						}}
					>
						{runs(item.text, context)}
					</Text>
				</Section>
			);
		case "divider":
			return (
				<Hr
					key={key}
					style={{
						margin: "0 0 18px",
						border: "0 none",
						borderTop: `1px solid ${EMAIL_THEME.border}`,
					}}
				/>
			);
		case "spacer": {
			const height = item.size === "sm" ? 8 : item.size === "md" ? 20 : 36;
			return (
				<Section
					key={key}
					style={{ height: `${height}px`, lineHeight: `${height}px` }}
				/>
			);
		}
		case "columns":
			return (
				<Row key={key} style={{ margin: "0 0 18px" }}>
					{item.columns.map((column, columnIndex) => (
						<Column
							// biome-ignore lint/suspicious/noArrayIndexKey: a column's position in the row is its identity
							key={`${key}-${columnIndex}`}
							style={{
								verticalAlign: "top",
								paddingRight:
									columnIndex === item.columns.length - 1 ? "0" : "16px",
							}}
						>
							{column.map((child, childIndex) =>
								renderBlock(child, childIndex, context, brand),
							)}
						</Column>
					))}
				</Row>
			);
		default:
			return null;
	}
}

type ShellInput = Omit<RenderInput, "document"> & { document: EmailDocument };

function Shell({ input }: { input: ShellInput }): JSX.Element {
	const context = input.context ?? {};
	const shell = input.shell;
	const brand = shell.brandColor ?? EMAIL_THEME.brand;
	const document = input.document;
	const header = shell.header?.blocks ?? [];
	const footer = shell.footer?.blocks ?? [];

	return (
		<Html lang="en">
			<Head />
			{input.preheader ? (
				<Preview>{resolveMerge(input.preheader, context)}</Preview>
			) : null}
			<Body
				style={{
					margin: "0",
					padding: "0",
					backgroundColor: EMAIL_THEME.page,
					fontFamily:
						"-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
				}}
			>
				{createElement("mso-shell-open")}
				<Container
					width={EMAIL_WIDTH}
					style={{
						width: "100%",
						maxWidth: `${EMAIL_WIDTH}px`,
						margin: "0 auto",
						backgroundColor: EMAIL_THEME.surface,
					}}
				>
					<Section
						style={{
							padding: `20px ${EMAIL_PADDING_X}px`,
							borderBottom: `1px solid ${EMAIL_THEME.border}`,
						}}
					>
						{shell.logoUrl ? (
							<Img
								src={shell.logoUrl}
								alt={shell.logoAlt ?? shell.workspaceName}
								height={24}
								style={{ maxWidth: "100%", border: "0 none", display: "block" }}
							/>
						) : (
							<Text
								style={{
									margin: "0",
									fontSize: "15px",
									lineHeight: "22px",
									fontWeight: 600,
									color: EMAIL_THEME.foreground,
									...BREAK_LONG_WORDS,
								}}
							>
								{shell.workspaceName}
							</Text>
						)}
						{header.map((item, index) =>
							renderBlock(item, index, context, brand),
						)}
					</Section>

					<Section style={{ padding: `${EMAIL_PADDING_X}px` }}>
						{document.blocks.map((item, index) =>
							renderBlock(item, index, context, brand),
						)}
					</Section>

					<Section
						style={{
							padding: `18px ${EMAIL_PADDING_X}px`,
							borderTop: `1px solid ${EMAIL_THEME.border}`,
							backgroundColor: EMAIL_THEME.surfaceMuted,
						}}
					>
						{footer.map((item, index) =>
							renderBlock(item, index, context, brand),
						)}
						<Text
							style={{
								margin: "0 0 6px",
								fontSize: "12px",
								lineHeight: "18px",
								color: EMAIL_THEME.muted,
								...BREAK_LONG_WORDS,
							}}
						>
							{shell.postalAddress}
						</Text>
						<Text
							style={{
								margin: "0",
								fontSize: "12px",
								lineHeight: "18px",
								color: EMAIL_THEME.muted,
								...BREAK_LONG_WORDS,
							}}
						>
							<Link
								href={shell.unsubscribeUrl}
								style={{
									color: EMAIL_THEME.muted,
									textDecoration: "underline",
								}}
							>
								Unsubscribe
							</Link>
							{shell.preferencesUrl ? (
								<>
									{" · "}
									<Link
										href={shell.preferencesUrl}
										style={{
											color: EMAIL_THEME.muted,
											textDecoration: "underline",
										}}
									>
										Email preferences
									</Link>
								</>
							) : null}
						</Text>
					</Section>
				</Container>
				{createElement("mso-shell-close")}
			</Body>
		</Html>
	);
}

function shellElement(input: RenderInput): JSX.Element {
	return (
		<Shell input={{ ...input, document: parseDocument(input.document) }} />
	);
}

export async function renderEmail(
	input: RenderInput,
): Promise<{ html: string; text: string }> {
	const element = shellElement(input);

	const [html, text] = await Promise.all([
		render(element, { pretty: false }),
		render(element, { plainText: true }),
	]);

	return { html: withMsoShell(html), text };
}

export async function renderPlainText(input: RenderInput): Promise<string> {
	return render(shellElement(input), { plainText: true });
}
