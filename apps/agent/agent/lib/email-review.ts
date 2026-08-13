import { db } from "@crm/db";
import { readMarketingSettings } from "@crm/db/marketing";
import { readWorkspaceIdentity } from "@crm/db/workspace";
import { type EmailDocument, renderEmail } from "@crm/email";
import {
	BLOCK_SHAPES,
	documentProblems,
	readDocument,
} from "@crm/email/document";
import { z } from "zod";
import { EMAIL_REVIEW } from "./email-review-config";
import {
	captureEmail,
	type Screen,
	type ViewMeasurements,
	type ViewName,
} from "./email-screenshot";

export const draftEmail = z.object({
	document: z.record(z.string(), z.unknown()),
	subject: z.string().max(200).optional(),
	preheader: z.string().max(300).optional(),
});

export type DraftEmail = z.infer<typeof draftEmail>;

export type ReviewRequest = {
	templateId?: string;
	nodeId?: string;
	draft?: DraftEmail;
};

export type ReviewSubject = {
	label: string;
	subject: string;
	preheader: string | null;
	document: EmailDocument;
};

type Refusal = {
	error: string;
	problems?: ReturnType<typeof documentProblems>;
	shapes?: typeof BLOCK_SHAPES;
};

function unreadable(value: DraftEmail["document"]): Refusal {
	return {
		error: "That email content cannot be read, so nothing can be rendered.",
		problems: documentProblems(value),
		shapes: BLOCK_SHAPES,
	};
}

export async function resolveReviewSource(
	input: ReviewRequest,
): Promise<ReviewSubject | Refusal> {
	const picked = [input.templateId, input.nodeId, input.draft].filter(
		(part) => part !== undefined,
	);

	if (picked.length !== 1) {
		return { error: "Pass exactly one of templateId, nodeId or draft." };
	}

	if (input.draft) {
		const document = readDocument(input.draft.document);
		if (!document) return unreadable(input.draft.document);

		return {
			label: "the draft",
			subject: input.draft.subject ?? "",
			preheader: input.draft.preheader ?? null,
			document,
		};
	}

	if (input.templateId) {
		const row = await db.marketingTemplate.findUnique({
			where: { id: input.templateId },
			select: { name: true, subject: true, preheader: true, document: true },
		});

		if (!row) return { error: "No template with that id." };

		const document = readDocument(row.document);
		if (!document) {
			return {
				error:
					"That template's content cannot be read, so nothing can be rendered.",
			};
		}

		return {
			label: `template "${row.name}"`,
			subject: row.subject,
			preheader: row.preheader,
			document,
		};
	}

	const node = await db.marketingCampaignNode.findUnique({
		where: { id: input.nodeId },
		select: {
			id: true,
			kind: true,
			label: true,
			subject: true,
			preheader: true,
			document: true,
		},
	});

	if (!node) return { error: "No node with that id." };

	if (node.kind !== "EMAIL") {
		return {
			error: `That node is a ${node.kind}. Only an EMAIL has a body to look at.`,
		};
	}

	if (node.document === null) {
		return {
			error:
				"That node has no body yet. Write one with update_node, then look at it.",
		};
	}

	const document = readDocument(node.document);
	if (!document) {
		return {
			error: "That node's content cannot be read, so nothing can be rendered.",
		};
	}

	return {
		label: `campaign step "${node.label ?? node.id}"`,
		subject: node.subject ?? "",
		preheader: node.preheader,
		document,
	};
}

export async function composeReviewHtml(
	source: ReviewSubject,
): Promise<{ html: string } | { blocked: string }> {
	const origin = (process.env.APP_URL ?? "").replace(/\/$/, "");

	const [settings, workspace, header, footer] = await Promise.all([
		readMarketingSettings(db),
		readWorkspaceIdentity(db).catch(() => null),
		db.marketingPartial.findFirst({
			where: { kind: "HEADER", isDefault: true, archivedAt: null },
			select: { document: true },
		}),
		db.marketingPartial.findFirst({
			where: { kind: "FOOTER", isDefault: true, archivedAt: null },
			select: { document: true },
		}),
	]);

	if (!origin || !settings.postalAddress) {
		return {
			blocked:
				"Set a postal address in Marketing settings, and APP_URL for this install, before anything can be previewed or sent.",
		};
	}

	const { html } = await renderEmail({
		document: source.document,
		preheader: source.preheader,
		shell: {
			workspaceName: workspace?.name ?? "",
			logoUrl: settings.logoUrl,
			logoAlt: workspace?.name ?? null,
			brandColor: settings.brandColor,
			postalAddress: settings.postalAddress,
			header: header ? readDocument(header.document) : null,
			footer: footer ? readDocument(footer.document) : null,
			unsubscribeUrl: `${origin}/u/preview`,
		},
		context: { workspace: { name: workspace?.name ?? null } },
	});

	return { html };
}

export type Finding = {
	code: string;
	view: ViewName;
	observed: string;
};

export function firstScreenImageCoverage(
	measurements: ViewMeasurements,
): number {
	const fold = measurements.width * measurements.foldHeight;
	let covered = 0;

	for (const image of measurements.images) {
		const width =
			Math.min(image.left + image.width, measurements.width) -
			Math.max(image.left, 0);
		const height =
			Math.min(image.top + image.height, measurements.foldHeight) -
			Math.max(image.top, 0);

		if (width > 0 && height > 0) covered += width * height;
	}

	if (fold <= 0) return 0;

	return Math.min(100, Math.round((covered / fold) * 100));
}

function shortSrc(src: string): string {
	return src.length > 120 ? `${src.slice(0, 117)}…` : src;
}

export function findingsFor(measurements: ViewMeasurements): Finding[] {
	const rules = EMAIL_REVIEW.firstScreen;
	const findings: Finding[] = [];
	const view = measurements.view;
	const fold = measurements.foldHeight;
	const coverage = firstScreenImageCoverage(measurements);
	const text = measurements.firstScreenTextCharacters;

	if (coverage >= rules.imageDominancePercent) {
		findings.push({
			code: "image-dominates-first-screen",
			view,
			observed: `Images cover ${coverage}% of the first ${fold}px. A reader sees pictures before a single sentence.`,
		});
	}

	if (coverage < rules.emptyCoveragePercent && text < rules.minTextCharacters) {
		findings.push({
			code: "empty-first-screen",
			view,
			observed: `The first ${fold}px is nearly empty: ${coverage}% image and ${text} characters of text.`,
		});
	} else if (text < rules.minTextCharacters) {
		findings.push({
			code: "little-text-on-first-screen",
			view,
			observed: `Only ${text} characters of text are visible before scrolling.`,
		});
	}

	for (const image of measurements.images) {
		const inFold = image.top < fold && image.top + image.height > 0;

		if (inFold && image.height >= fold * rules.nearFoldFraction) {
			findings.push({
				code: "image-taller-than-first-screen",
				view,
				observed: `An image ${image.width}×${image.height}px nearly or fully exceeds the ${fold}px first screen, so a reader sees it cut off (${shortSrc(image.src)}).`,
			});
		}

		if (
			image.naturalWidth > 0 &&
			image.width > image.naturalWidth * rules.upscaleFactor
		) {
			findings.push({
				code: "image-upscaled",
				view,
				observed: `An image is drawn at ${image.width}px from a ${image.naturalWidth}px source, so it renders blurry (${shortSrc(image.src)}).`,
			});
		}
	}

	const blocked = measurements.blockedRequests;

	if (blocked.length > 0) {
		const named = blocked
			.slice(0, EMAIL_REVIEW.requests.maxReported)
			.map(shortSrc)
			.join(", ");
		const rest = blocked.length - EMAIL_REVIEW.requests.maxReported;

		findings.push({
			code: "address-not-loaded",
			view,
			observed: `Nothing was loaded from ${named}${rest > 0 ? `, and ${rest} more address(es)` : ""}. The renderer loads public addresses and this install's own origin only. A reader on another network cannot reach that address either, so they see a gap.`,
		});
	}

	if (measurements.horizontalOverflowPx > 0) {
		findings.push({
			code: "horizontal-overflow",
			view,
			observed: `The page is ${measurements.horizontalOverflowPx}px wider than the ${measurements.width}px viewport, so a reader scrolls sideways.`,
		});
	}

	return findings;
}

const judgeAnswer = z.object({
	choices: z
		.array(z.object({ message: z.object({ content: z.string().nullable() }) }))
		.min(1),
});

export type VisualRead = { observations: string } | { skipped: string };

function judgeCredential(): string | null {
	return (
		process.env.AI_GATEWAY_API_KEY?.trim() ||
		process.env.VERCEL_OIDC_TOKEN?.trim() ||
		null
	);
}

function judgePrompt(subject: string, screens: readonly Screen[]): string {
	const lines = screens.map(
		(screen, index) =>
			`Screenshot ${index + 1} is the ${screen.measurements.view} rendering, ${screen.measurements.width}px wide; the first ${screen.measurements.foldHeight}px is what a reader sees before scrolling.`,
	);

	return [
		`These are screenshots of one marketing email, subject "${subject}".`,
		...lines,
		"For each screenshot, report:",
		"- what is on the first screen, in one or two sentences",
		"- anything oversized, cut off, overlapping, empty or unreadable",
		"Describe only what is visible. No scores, no grades, no praise, and no guesses about content you cannot see.",
	].join("\n");
}

export async function visualRead(
	screens: readonly Screen[],
	subject: string,
): Promise<VisualRead> {
	const credential = judgeCredential();

	if (!credential) {
		return {
			skipped:
				"No AI Gateway credential in this process, so no visual read was made. The measurements are still exact.",
		};
	}

	try {
		const response = await fetch(EMAIL_REVIEW.judge.url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${credential}`,
			},
			body: JSON.stringify({
				model: EMAIL_REVIEW.judge.model,
				max_tokens: EMAIL_REVIEW.judge.maxOutputTokens,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: judgePrompt(subject, screens) },
							...screens.map((screen) => ({
								type: "image_url",
								image_url: {
									url: `data:image/jpeg;base64,${screen.screenshotBase64}`,
								},
							})),
						],
					},
				],
			}),
			signal: AbortSignal.timeout(EMAIL_REVIEW.judge.timeoutMs),
		});

		if (!response.ok) {
			return {
				skipped: `The vision model answered ${response.status}, so no visual read was made. The measurements are still exact.`,
			};
		}

		const parsed = judgeAnswer.safeParse(await response.json());
		const observations = parsed.success
			? parsed.data.choices[0]?.message.content?.trim()
			: undefined;

		if (!observations) {
			return {
				skipped:
					"The vision model answered with nothing readable, so no visual read was made. The measurements are still exact.",
			};
		}

		return { observations };
	} catch (error) {
		return {
			skipped: `The vision model could not be reached (${
				error instanceof Error ? error.message : String(error)
			}), so no visual read was made. The measurements are still exact.`,
		};
	}
}

function screenSummary(measurements: ViewMeasurements) {
	return {
		view: measurements.view,
		width: measurements.width,
		firstScreenHeight: measurements.foldHeight,
		pageHeight: measurements.pageHeight,
		horizontalOverflowPx: measurements.horizontalOverflowPx,
		firstScreen: {
			imageCoveragePercent: firstScreenImageCoverage(measurements),
			textCharacters: measurements.firstScreenTextCharacters,
		},
		images: measurements.images.map((image) => ({
			src: shortSrc(image.src),
			top: image.top,
			width: image.width,
			height: image.height,
		})),
	};
}

export async function reviewEmail(
	input: ReviewRequest,
	executablePath: string,
) {
	const source = await resolveReviewSource(input);
	if ("error" in source) return source;

	const composed = await composeReviewHtml(source);
	if ("blocked" in composed) return composed;

	let screens: Screen[];

	try {
		screens = await captureEmail(
			composed.html,
			[
				{ view: "desktop", ...EMAIL_REVIEW.viewports.desktop },
				{ view: "mobile", ...EMAIL_REVIEW.viewports.mobile },
			],
			executablePath,
		);
	} catch (error) {
		return {
			error: `The browser could not render the email (${
				error instanceof Error ? error.message : String(error)
			}). This says nothing about the email itself.`,
		};
	}

	const findings = screens.flatMap((screen) =>
		findingsFor(screen.measurements),
	);

	return {
		reviewed: source.label,
		subject: source.subject,
		screens: screens.map((screen) => screenSummary(screen.measurements)),
		findings,
		visualRead: await visualRead(screens, source.subject),
	};
}
