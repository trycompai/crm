import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { TRACING } from "../agent/lib/tracing-config";

const SKIP_KEYS = [
	"workflow.",
	"messaging.",
	"rpc.",
	"http.",
	"$eve.",
	"step.",
];
const MIN_LENGTH = 12;

const PATTERNS = [
	{
		label: "email address",
		re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g,
	},
	{ label: "UK mobile", re: /\b07\d{3}\s?\d{6}\b/g },
	{ label: "UK postcode", re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g },
	{ label: "US phone", re: /\b\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g },
	{ label: "national insurance", re: /\b[A-Z]{2}\d{6}[A-D]\b/g },
	{ label: "US social security", re: /\b\d{3}-\d{2}-\d{4}\b/g },
	{ label: "date", re: /\b(19|20)\d{2}-\d{2}-\d{2}\b/g },
	{
		label: "sensitive category",
		re: /\b(divorce|cancer|diagnos\w+|pregnan\w+|redundan\w+|bereave\w+|compassionate leave|visa status|immigration)\b/gi,
	},
] as const;

const spanAttributeText = z.union([
	z.string(),
	z.json().transform((value) => JSON.stringify(value)),
]);

const traceSpan = z.object({
	attributes: z.record(z.string(), spanAttributeText).default({}),
	name: z.string().default(""),
	span_id: z.string().default(""),
	trace_id: z.string().default(""),
});

type TraceSpan = z.infer<typeof traceSpan>;

function parseSpan(line: string): TraceSpan | null {
	try {
		return traceSpan.parse(JSON.parse(line));
	} catch {
		return null;
	}
}

function labelsIn(content: string): string[] {
	const found: string[] = [];

	for (const { label, re } of PATTERNS) {
		re.lastIndex = 0;
		if (re.test(content)) found.push(label);
		re.lastIndex = 0;
	}

	return found;
}

function withoutCredential(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return "the export url";
	}
}

async function download(url: string): Promise<Buffer> {
	const response = await fetch(url);

	if (!response.ok) {
		console.error(
			`${withoutCredential(url)} answered ${response.status} ${response.statusText}. Nothing was scanned, so this is not a clean export.`,
		);
		process.exit(1);
	}

	return Buffer.from(await response.arrayBuffer());
}

type Finding = {
	spanId: string;
	traceId: string;
	kind: string;
	name: string;
	labels: Set<string>;
};

const source = process.argv[2];

if (!source) {
	console.error(
		[
			"Scans a Catalyst trace export for personal data that left this install.",
			"",
			"  bun run scan:egress <spans.jsonl|spans.jsonl.gz|https://…>",
			"",
			"Get the export from the Inference dashboard, or ask Claude to queue one",
			"over MCP (export_traces, then get_trace_export_download_url). There is no",
			"public REST endpoint for it, so the file is the interface.",
		].join("\n"),
	);
	process.exit(1);
}

const bytes = source.startsWith("http")
	? await download(source)
	: readFileSync(source);

const text = (
	bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes
).toString("utf8");

const lines = text.split("\n").filter(Boolean);
const carriers = new Map<string, Finding>();
const byLabel = new Map<string, number>();
let withContent = 0;

for (const line of lines) {
	const span = parseSpan(line);
	if (span === null) continue;

	const attributes = span.attributes;
	const spanId = span.span_id;
	let counted = false;

	for (const [key, content] of Object.entries(attributes)) {
		if (SKIP_KEYS.some((skip) => key.startsWith(skip))) continue;

		const labels = labelsIn(content);
		if (labels.length === 0 && content.length < MIN_LENGTH) continue;

		if (!counted) {
			withContent += 1;
			counted = true;
		}

		for (const label of labels) {
			byLabel.set(label, (byLabel.get(label) ?? 0) + 1);

			const found = carriers.get(spanId) ?? {
				spanId,
				traceId: span.trace_id,
				kind: attributes["openinference.span.kind"] ?? "",
				name: span.name,
				labels: new Set<string>(),
			};
			found.labels.add(label);
			carriers.set(spanId, found);
		}
	}
}

console.log(
	`${lines.length} spans, ${withContent} carrying content, ${carriers.size} carrying personal data.\n`,
);

if (carriers.size === 0) {
	console.log("No matches in this export.");
	process.exit(0);
}

console.log("By category:");
for (const [label, count] of [...byLabel].sort((a, b) => b[1] - a[1])) {
	console.log(`  ${String(count).padStart(5)}  ${label}`);
}

const kinds = new Map<string, number>();
for (const found of carriers.values()) {
	kinds.set(found.kind, (kinds.get(found.kind) ?? 0) + 1);
}

console.log("\nBy span kind:");
for (const [kind, count] of [...kinds].sort((a, b) => b[1] - a[1])) {
	console.log(`  ${String(count).padStart(5)}  ${kind || "(none)"}`);
}

console.log("\nCarrier spans:");
for (const found of [...carriers.values()].slice(0, 15)) {
	console.log(
		`  ${found.kind.padEnd(6)} ${found.spanId}  ${found.name}\n` +
			`         trace=${found.traceId}\n` +
			`         ${[...found.labels].join(", ")}`,
	);
}

if (carriers.size > 15) {
	console.log(`  … and ${carriers.size - 15} more.`);
}

console.log(
	`\nThis is what the tracing vendor holds. Set ${TRACING.content.recordVar}=0 to\n` +
		"withhold it; apps/agent/agent/lib/tracing-config.ts holds the default, which is\n" +
		"to record. The same text rides on the TOOL result and again on the AGENT\n" +
		"prompt, so one value here is counted twice.",
);
