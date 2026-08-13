import { type Block, plainTextOf, readDocument, walkBlocks } from "./document";
import { isKnownTag, NULLABLE_TAGS, tagsIn } from "./merge";

export type LintLevel = "error" | "warning";

export type LintFinding = {
	level: LintLevel;
	code: string;
	message: string;
	blockIndex?: number;
};

export type LintInput = {
	document: unknown;
	subject?: string | null;
	preheader?: string | null;
	recipientCount?: number;
	attachmentBytes?: number;
	attachmentCount?: number;
};

const GMAIL_CLIP_BYTES = 102_000;
const ATTACHMENT_LIMIT = 40 * 1024 * 1024;
const SUBJECT_MOBILE_CUT = 50;
const SUBJECT_MAX = 150;

function checkInlines(
	items: { text: string; href?: string }[],
	findings: LintFinding[],
	blockIndex: number,
): void {
	for (const run of items) {
		for (const { tag, fallback } of tagsIn(run.text)) {
			if (!isKnownTag(tag)) {
				findings.push({
					level: "error",
					code: "unknown-merge-tag",
					blockIndex,
					message: `{{${tag}}} is not a field we can fill in.`,
				});
				continue;
			}

			if (
				NULLABLE_TAGS.has(tag) &&
				(fallback === null || fallback.trim() === "")
			) {
				findings.push({
					level: "warning",
					code: "merge-tag-no-fallback",
					blockIndex,
					message: `{{${tag}}} is often empty. Give it a fallback, or somebody gets "Hi ,".`,
				});
			}
		}
	}
}

export function lintEmail(input: LintInput): LintFinding[] {
	const findings: LintFinding[] = [];
	const document = readDocument(input.document);

	if (!document) {
		return [
			{
				level: "error",
				code: "unreadable-document",
				message: "This email's content cannot be read.",
			},
		];
	}

	const subject = input.subject?.trim() ?? "";

	if (subject === "") {
		findings.push({
			level: "error",
			code: "subject-empty",
			message: "This email has no subject.",
		});
	} else if (subject.length > SUBJECT_MAX) {
		findings.push({
			level: "error",
			code: "subject-too-long",
			message: `The subject is ${subject.length} characters. Keep it under ${SUBJECT_MAX}.`,
		});
	} else if (subject.length > SUBJECT_MOBILE_CUT) {
		findings.push({
			level: "warning",
			code: "subject-mobile-cut",
			message: `The subject is ${subject.length} characters. Most phones cut it at ${SUBJECT_MOBILE_CUT}.`,
		});
	}

	if (!input.preheader?.trim()) {
		findings.push({
			level: "warning",
			code: "no-preheader",
			message:
				"No preheader, so the inbox shows the first line of the body instead.",
		});
	}

	let images = 0;
	let links = 0;
	let blocks = 0;
	let lastHeading = 0;
	let index = 0;

	walkBlocks(document.blocks, (item: Block) => {
		blocks += 1;
		const blockIndex = index;
		index += 1;

		switch (item.type) {
			case "heading": {
				if (lastHeading > 0 && item.level > lastHeading + 1) {
					findings.push({
						level: "error",
						code: "heading-skipped",
						blockIndex,
						message: `This jumps from heading ${lastHeading} to heading ${item.level}. Screen readers read that as a missing section.`,
					});
				}
				lastHeading = item.level;
				checkInlines(item.text, findings, blockIndex);
				links += item.text.filter((run) => run.href).length;
				break;
			}
			case "text":
			case "quote": {
				checkInlines(item.text, findings, blockIndex);
				links += item.text.filter((run) => run.href).length;
				break;
			}
			case "button": {
				links += 1;
				if (!item.href.trim()) {
					findings.push({
						level: "error",
						code: "button-no-href",
						blockIndex,
						message: "This button goes nowhere.",
					});
				}
				break;
			}
			case "image": {
				images += 1;
				const source = item.src.toLowerCase();

				if (source.endsWith(".svg") || source.endsWith(".webp")) {
					findings.push({
						level: "error",
						code: "image-format",
						blockIndex,
						message:
							"Outlook and Gmail will not draw SVG or WEBP. Use PNG or JPG.",
					});
				}

				if (!item.alt.trim()) {
					findings.push({
						level: "error",
						code: "image-no-alt",
						blockIndex,
						message: item.href
							? "This image is a link with no alt text, so the link has no name."
							: "This image has no alt text. Screen readers will skip it.",
					});
				}
				break;
			}
			default:
				break;
		}
	});

	if (blocks > 0 && images / blocks > 0.6) {
		findings.push({
			level: "warning",
			code: "image-heavy",
			message:
				"Most of this email is images. Spam filters read that badly, and images are off by default in Outlook.",
		});
	}

	if (links === 0) {
		findings.push({
			level: "warning",
			code: "no-links",
			message: "There is nothing to click in this email.",
		});
	} else if (links > 15) {
		findings.push({
			level: "warning",
			code: "too-many-links",
			message: `${links} links is a lot. Spam filters count them.`,
		});
	}

	const size = JSON.stringify(document).length * 3;
	if (size > GMAIL_CLIP_BYTES) {
		findings.push({
			level: "warning",
			code: "gmail-clip",
			message:
				"This email is long enough that Gmail will clip it and hide the unsubscribe link behind a link.",
		});
	}

	if (input.attachmentBytes && input.attachmentBytes > ATTACHMENT_LIMIT) {
		findings.push({
			level: "error",
			code: "attachments-too-big",
			message: "Attachments add up to more than 40 MB, which Resend refuses.",
		});
	}

	if ((input.attachmentCount ?? 0) > 0 && (input.recipientCount ?? 0) > 50) {
		findings.push({
			level: "warning",
			code: "attachment-on-a-big-send",
			message:
				"Attachments cannot be batched, so this send will take far longer and lands worse.",
		});
	}

	return findings;
}

export function lintErrors(findings: LintFinding[]): LintFinding[] {
	return findings.filter((finding) => finding.level === "error");
}

export function summarize(findings: LintFinding[]): string {
	const errors = findings.filter((finding) => finding.level === "error").length;
	const warnings = findings.length - errors;

	if (errors === 0 && warnings === 0) return "No problems.";
	if (errors === 0)
		return `${warnings} thing${warnings === 1 ? "" : "s"} to look at.`;
	return `${errors} error${errors === 1 ? "" : "s"} to fix.`;
}

export function textLength(document: unknown): number {
	const parsed = readDocument(document);
	if (!parsed) return 0;

	let total = 0;
	walkBlocks(parsed.blocks, (item) => {
		if (
			item.type === "heading" ||
			item.type === "text" ||
			item.type === "quote"
		) {
			total += plainTextOf(item.text).length;
		}
	});

	return total;
}
