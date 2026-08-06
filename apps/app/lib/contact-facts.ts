import type { RouterOutputs } from "@/lib/trpc/types";

type Contact = RouterOutputs["contacts"]["byId"];

export type ContactFact = Contact["facts"][number];

export function factsByField(facts: ContactFact[]) {
	const applied = new Map<string, ContactFact>();
	const proposed = new Map<string, ContactFact>();

	for (const fact of facts) {
		const bucket = fact.status === "APPLIED" ? applied : proposed;
		if (!bucket.has(fact.field)) bucket.set(fact.field, fact);
	}

	return { applied, proposed };
}
