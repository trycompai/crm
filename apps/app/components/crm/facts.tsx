"use client";

import { Provenance } from "@crm/ui/components/sourced-value";
import { Suggestion } from "@crm/ui/components/suggestion";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { LocalDateTime } from "@/components/local-date-time";
import type { ContactFact } from "@/lib/contact-facts";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function FactProvenance({ fact }: { fact: ContactFact }) {
	return (
		<Provenance
			claim={fact.value}
			reasons={fact.evidence.map((item) => item.detail)}
			observedAt={
				<LocalDateTime
					date={fact.observedAt}
					options={{ month: "short", day: "numeric", year: "numeric" }}
				/>
			}
			sourceUrl={fact.sourceUrl}
		/>
	);
}

export function FactSuggestion({
	fact,
	contactId,
}: {
	fact: ContactFact;
	contactId: string;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const decide = useMutation(
		trpc.contacts.decideFact.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.applied
						? "Added to the record."
						: "Dismissed — it won't be suggested again.",
				);
				return cache.contact(contactId, { settle: "record" });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Suggestion
			value={fact.value}
			rationale={fact.evidence.map((item) => item.detail).join(" · ")}
			pending={decide.isPending}
			onAccept={() => decide.mutate({ factId: fact.id, decision: "accept" })}
			onDismiss={() => decide.mutate({ factId: fact.id, decision: "dismiss" })}
		/>
	);
}
