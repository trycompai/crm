"use client";

import Launch from "@carbon/icons-react/es/Launch";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { LocalDateTime } from "@/components/local-date-time";
import { safeExternalHref } from "@/lib/safe-external-url";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

type Note = {
	id: string;
	title: string;
	sourceUrl: string | null;
	ownerName: string | null;
	summary: string | null;
	attendees: unknown;
	folders: unknown;
	startedAt: string;
};

type Company = {
	id: string;
	name: string;
	domain: string | null;
	contacts: {
		id: string;
		firstName: string;
		lastName: string | null;
		email: string | null;
	}[];
	deals: { id: string; name: string; stage: string }[];
};

type GranolaReviewData = { notes: Note[]; companies: Company[] };

const NONE = "none";

export function GranolaReview() {
	const trpc = useTRPC();
	const { slug } = useParams<{ slug: string }>();
	const query = useSuspenseQuery(trpc.inbound.granolaReview.queryOptions());
	const review = query.data as unknown as GranolaReviewData;

	return (
		<div className="max-w-4xl space-y-4">
			<div>
				<Button asChild variant="outline" size="sm">
					<Link href={`/${slug}/settings/connections`}>
						Back to connections
					</Link>
				</Button>
			</div>

			{review.notes.length > 0 ? (
				review.notes.map((note) => (
					<GranolaNoteCard
						key={note.id}
						note={note}
						companies={review.companies}
					/>
				))
			) : (
				<Card>
					<CardHeader>
						<CardTitle>All Granola notes are resolved</CardTitle>
						<CardDescription>
							New ambiguous calls will wait here rather than attaching to the
							wrong customer.
						</CardDescription>
					</CardHeader>
				</Card>
			)}
		</div>
	);
}

function GranolaNoteCard({
	note,
	companies,
}: {
	note: Note;
	companies: Company[];
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [companyId, setCompanyId] = useState(NONE);
	const [contactId, setContactId] = useState(NONE);
	const [dealId, setDealId] = useState(NONE);
	const company = companies.find((candidate) => candidate.id === companyId);
	const people = labels(note.attendees);
	const folders = labels(note.folders);
	const sourceHref = safeExternalHref(note.sourceUrl);

	const match = useMutation(
		trpc.inbound.matchGranola.mutationOptions({
			onSuccess: async () => {
				await cache.inbound();
				toast.success("Granola note matched.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const exclude = useMutation(
		trpc.inbound.excludeGranola.mutationOptions({
			onSuccess: async () => {
				await cache.inbound();
				toast.success("Granola note excluded permanently.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{note.title}</CardTitle>
				<CardDescription>
					<LocalDateTime
						date={note.startedAt}
						options={{ dateStyle: "medium", timeStyle: "short" }}
					/>
					{note.ownerName ? ` · Owner ${note.ownerName}` : ""}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-1 text-sm">
					{people.length > 0 ? (
						<p>
							<span className="text-muted-foreground">Attendees:</span>{" "}
							{people.join(", ")}
						</p>
					) : null}
					{folders.length > 0 ? (
						<p>
							<span className="text-muted-foreground">Folders:</span>{" "}
							{folders.join(", ")}
						</p>
					) : null}
					{note.summary ? (
						<p className="max-w-3xl whitespace-pre-wrap text-muted-foreground">
							{note.summary}
						</p>
					) : null}
					{sourceHref ? (
						<Button asChild variant="link" size="sm" className="h-auto px-0">
							<a href={sourceHref} target="_blank" rel="noreferrer noopener">
								Open in Granola
								<Icon icon={Launch} data-icon="inline-end" />
							</a>
						</Button>
					) : null}
				</div>

				<div className="grid gap-3 md:grid-cols-3">
					<Select
						value={companyId}
						onValueChange={(value) => {
							setCompanyId(value);
							setContactId(NONE);
							setDealId(NONE);
						}}
					>
						<SelectTrigger aria-label="Company">
							<SelectValue placeholder="Choose company" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NONE}>Choose company</SelectItem>
							{companies.map((option) => (
								<SelectItem key={option.id} value={option.id}>
									{option.name}
									{option.domain ? ` · ${option.domain}` : ""}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Select
						value={contactId}
						onValueChange={setContactId}
						disabled={!company}
					>
						<SelectTrigger aria-label="Contact">
							<SelectValue placeholder="Optional contact" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NONE}>No contact</SelectItem>
							{company?.contacts.map((contact) => (
								<SelectItem key={contact.id} value={contact.id}>
									{[contact.firstName, contact.lastName]
										.filter(Boolean)
										.join(" ")}
									{contact.email ? ` · ${contact.email}` : ""}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Select value={dealId} onValueChange={setDealId} disabled={!company}>
						<SelectTrigger aria-label="Deal">
							<SelectValue placeholder="Optional deal" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NONE}>No deal</SelectItem>
							{company?.deals.map((deal) => (
								<SelectItem key={deal.id} value={deal.id}>
									{deal.name} · {deal.stage.toLowerCase().replaceAll("_", " ")}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button
						disabled={companyId === NONE || match.isPending}
						onClick={() =>
							match.mutate({
								id: note.id,
								companyId,
								contactId: contactId === NONE ? null : contactId,
								dealId: dealId === NONE ? null : dealId,
							})
						}
					>
						{match.isPending ? "Matching…" : "Match to CRM"}
					</Button>

					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="outline" disabled={exclude.isPending}>
								<Icon icon={TrashCan} data-icon="inline-start" />
								Exclude
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Exclude this Granola note?</AlertDialogTitle>
								<AlertDialogDescription>
									It will be removed from the CRM and its Granola ID will be
									suppressed so future imports cannot bring it back.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Keep note</AlertDialogCancel>
								<AlertDialogAction
									variant="destructive"
									onClick={() =>
										exclude.mutate({
											id: note.id,
											reason: "Excluded by a Lode CRM operator as not relevant",
										})
									}
								>
									Exclude permanently
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</CardContent>
		</Card>
	);
}

function labels(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (typeof entry === "string") return entry.trim() ? [entry.trim()] : [];
		if (!entry || typeof entry !== "object") return [];
		const record = entry as Record<string, unknown>;
		const name = typeof record.name === "string" ? record.name.trim() : "";
		const email = typeof record.email === "string" ? record.email.trim() : "";
		const label = name && email ? `${name} · ${email}` : name || email;
		return label ? [label] : [];
	});
}
