import { db } from "@crm/db";
import { sweepBlankFacts } from "../agent/lib/blank-facts";

const dry = process.argv.includes("--dry");

const sweep = await sweepBlankFacts({ dry });

for (const fill of sweep.fills) {
	const dropped =
		fill.dropped > 0
			? ` — dropped ${fill.dropped} weaker suggestion${fill.dropped === 1 ? "" : "s"}`
			: "";

	console.log(
		`${fill.contact} · ${fill.field}: "${fill.value}" (${fill.score.toFixed(2)})${dropped}`,
	);
}

console.log(
	`\n${dry ? "Would fill" : "Filled"} ${count(sweep.filled, "empty field")} from ${count(sweep.scanned, "waiting suggestion")}. ${count(sweep.settled, "stale suggestion")} cleared, ${sweep.waiting} still need a rep.`,
);

if (sweep.unscanned > 0) {
	console.log(
		`${sweep.unscanned} suggestions were not looked at this pass. Run it again.`,
	);
}

await db.$disconnect();

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
