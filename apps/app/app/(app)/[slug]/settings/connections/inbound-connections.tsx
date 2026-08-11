"use client";

import Warning from "@carbon/icons-react/es/Warning";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

type ConnectionState = {
	label: string;
	tone: StatusTone;
	busy: boolean;
};

type InboundSyncSource = "website" | "agentMail" | "granola";

export function InboundConnections() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const { slug } = useParams<{ slug: string }>();
	const status = useSuspenseQuery({
		...trpc.inbound.status.queryOptions(),
		refetchInterval: (query) =>
			isPendingTask(query.state.data?.website.task?.state) ||
			isPendingTask(query.state.data?.agentMail.task?.state) ||
			isPendingTask(query.state.data?.granola.task?.state) ||
			isPendingTask(query.state.data?.replay.task?.state)
				? 1_500
				: false,
	});
	const sync = useMutation(
		trpc.inbound.syncNow.mutationOptions({
			onSuccess: async (result) => {
				await cache.inbound();
				if (result.configured === 0) {
					toast.error("That inbound connection is not configured yet.");
				} else {
					toast.success(
						result.queued > 0
							? "Inbound checks queued."
							: "The inbound check is already running.",
					);
				}
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const checkingSource = sync.isPending ? sync.variables?.source : null;
	const agentMailControl = useMutation(
		trpc.inbound.setAgentMailEnabled.mutationOptions({
			onSuccess: async (result) => {
				await cache.inbound();
				toast.success(
					result.enabled
						? "AgentMail outreach resumed."
						: "AgentMail outreach paused and queued sends stopped.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const websiteState = connectionState({
		configured: status.data.website.configured,
		connected: Boolean(status.data.website.lastImportedAt),
		queued: isPendingTask(status.data.website.task?.state),
		error:
			status.data.website.task?.state === "failed"
				? status.data.website.task.outcome
				: null,
	});
	const agentMailState = connectionState({
		configured: status.data.agentMail.configured,
		connected: Boolean(status.data.agentMail.lastSyncedAt),
		queued: isPendingTask(status.data.agentMail.task?.state),
		error:
			status.data.agentMail.lastError ??
			(status.data.agentMail.task?.state === "failed"
				? status.data.agentMail.task.outcome
				: null),
	});
	const granolaState = connectionState({
		configured: status.data.granola.configured,
		connected: Boolean(status.data.granola.lastImportedAt),
		queued: isPendingTask(status.data.granola.task?.state),
		error:
			status.data.granola.task?.state === "failed"
				? status.data.granola.task.outcome
				: null,
	});
	const replayState = connectionState({
		configured: true,
		connected:
			status.data.replay.receipts > 0 || status.data.replay.candidates > 0,
		queued: isPendingTask(status.data.replay.task?.state),
		error:
			status.data.replay.task?.state === "failed"
				? status.data.replay.task.outcome
				: null,
	});
	const agentMailCanToggle =
		Boolean(status.data.agentMail.inbox) &&
		(status.data.agentMail.inboxEnabled ||
			(status.data.agentMail.configured &&
				status.data.agentMail.canResumeOutbound));
	const agentMailOutbound = agentMailOutboundCopy({
		configured: status.data.agentMail.configured,
		inboxEnabled: status.data.agentMail.inboxEnabled,
		outboundEnabled: status.data.agentMail.outboundEnabled,
		providerPaused: status.data.agentMail.providerPaused,
		outreachPaused: status.data.agentMail.outreachPaused,
	});

	function check(source: InboundSyncSource) {
		sync.mutate({ source });
	}

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Website enquiries</CardTitle>
					<CardDescription>
						Imports request-access submissions from trylodeagent.io and starts
						the company and contact enrichment work automatically.
					</CardDescription>

					<CardAction>
						<StatusIndicator
							size="sm"
							tone={websiteState.tone}
							label={websiteState.label}
							busy={websiteState.busy}
						/>
						<Button
							variant="contrast"
							size="sm"
							disabled={!status.data.website.canCheck || sync.isPending}
							onClick={() => check("website")}
						>
							{checkingSource === "website" ? "Checking…" : "Check now"}
						</Button>
					</CardAction>
				</CardHeader>

				<CardContent>
					{status.data.website.configured ||
					status.data.website.hasHistoricalData ? (
						<>
							<p className="text-sm">
								{status.data.website.live.toLocaleString()} live enquiries
							</p>
							<p className="text-muted-foreground text-xs">
								{status.data.website.lastImportedAt ? (
									<>
										Last imported{" "}
										<LocalRelativeTime
											date={status.data.website.lastImportedAt}
										/>
									</>
								) : (
									"Ready for the first import"
								)}
								{status.data.website.tests > 0
									? ` · ${status.data.website.tests.toLocaleString()} isolated test records`
									: ""}
							</p>
							{status.data.website.configured ? null : (
								<p className="text-muted-foreground text-xs">
									Historical enquiries remain in the CRM, but new website checks
									are unavailable until the Supabase service key is restored.
								</p>
							)}
						</>
					) : (
						<p className="text-muted-foreground text-xs">
							Add the website Supabase service key to the root .env file to
							enable this feed. The public website does not need to change.
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>AgentMail</CardTitle>
					<CardDescription>
						Stores received email against the matching CRM record.
						Human-approved prospect sequences send from the same AgentMail inbox
						and stop on reply.
					</CardDescription>

					<CardAction>
						<StatusIndicator
							size="sm"
							tone={agentMailState.tone}
							label={agentMailState.label}
							busy={agentMailState.busy}
						/>
						<Button
							variant="contrast"
							size="sm"
							disabled={!status.data.agentMail.canCheck || sync.isPending}
							onClick={() => check("agentMail")}
						>
							{checkingSource === "agentMail" ? "Checking…" : "Check now"}
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={agentMailControl.isPending || !agentMailCanToggle}
							onClick={() =>
								agentMailControl.mutate({
									enabled: !status.data.agentMail.inboxEnabled,
								})
							}
						>
							{agentMailControl.isPending
								? "Saving…"
								: status.data.agentMail.inboxEnabled
									? "Pause outreach"
									: "Resume outreach"}
						</Button>
					</CardAction>
				</CardHeader>

				<CardContent>
					{status.data.agentMail.lastError ? (
						<Alert variant="destructive">
							<Icon icon={Warning} />
							<AlertTitle>AgentMail check failed</AlertTitle>
							<AlertDescription>
								{status.data.agentMail.lastError}
							</AlertDescription>
						</Alert>
					) : null}

					{status.data.agentMail.configured ||
					status.data.agentMail.hasHistoricalData ? (
						<>
							<p className="text-sm">
								{status.data.agentMail.messages.toLocaleString()} received
								messages
							</p>
							<p className="text-muted-foreground text-xs">
								{status.data.agentMail.inbox
									? `${status.data.agentMail.inbox} · `
									: ""}
								{status.data.agentMail.lastSyncedAt ? (
									<>
										Last checked{" "}
										<LocalRelativeTime
											date={status.data.agentMail.lastSyncedAt}
										/>
									</>
								) : (
									"Ready for the first check"
								)}
							</p>
							<p className="text-muted-foreground text-xs">
								{agentMailOutbound}
							</p>
							{status.data.agentMail.configured ? null : (
								<p className="text-muted-foreground text-xs">
									Historical AgentMail messages remain in the CRM, but new
									checks are unavailable until the API key and inbox ID are
									restored.
								</p>
							)}
						</>
					) : (
						<p className="text-muted-foreground text-xs">
							Add the AgentMail API key and inbox ID to the root .env file to
							enable inbound testing.
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Granola</CardTitle>
					<CardDescription>
						Imports call summaries, attendees and transcripts, then attaches
						them to the matching customer timeline. Uncertain calls remain
						unmatched for review.
					</CardDescription>

					<CardAction>
						<StatusIndicator
							size="sm"
							tone={granolaState.tone}
							label={granolaState.label}
							busy={granolaState.busy}
						/>
						<Button
							variant="contrast"
							size="sm"
							disabled={!status.data.granola.canCheck || sync.isPending}
							onClick={() => check("granola")}
						>
							{checkingSource === "granola" ? "Checking…" : "Check now"}
						</Button>
					</CardAction>
				</CardHeader>

				<CardContent>
					{status.data.granola.task?.state === "failed" ? (
						<Alert variant="destructive">
							<Icon icon={Warning} />
							<AlertTitle>Granola import failed</AlertTitle>
							<AlertDescription>
								{status.data.granola.task.outcome}
							</AlertDescription>
						</Alert>
					) : null}

					{status.data.granola.configured ||
					status.data.granola.hasHistoricalData ? (
						<>
							<p className="text-sm">
								{status.data.granola.notes.toLocaleString()} meeting notes ·{" "}
								{status.data.granola.matched.toLocaleString()} matched
							</p>
							<p className="text-muted-foreground text-xs">
								{status.data.granola.lastImportedAt ? (
									<>
										Last imported{" "}
										<LocalRelativeTime
											date={status.data.granola.lastImportedAt}
										/>
									</>
								) : (
									"Ready for the historical import"
								)}
								{status.data.granola.unmatched > 0
									? ` · ${status.data.granola.unmatched.toLocaleString()} need matching`
									: ""}
							</p>
							{status.data.granola.unmatched > 0 ? (
								<Button asChild variant="outline" size="sm" className="mt-3">
									<Link href={`/${slug}/settings/connections/granola`}>
										Review {status.data.granola.unmatched.toLocaleString()}{" "}
										unmatched
									</Link>
								</Button>
							) : null}
							{status.data.granola.configured ? null : (
								<p className="text-muted-foreground text-xs">
									Historical Granola notes remain in the CRM, but new imports
									are unavailable until the Granola API key is restored.
								</p>
							)}
						</>
					) : (
						<p className="text-muted-foreground text-xs">
							Add a Granola API key to the root .env file to enable call
							imports.
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Historical replay</CardTitle>
					<CardDescription>
						Replays stored website and mailbox envelopes into reviewable contact
						candidates. It never calls providers, spends on a model or creates
						contacts automatically.
					</CardDescription>

					<CardAction>
						<StatusIndicator
							size="sm"
							tone={replayState.tone}
							label={replayState.label}
							busy={replayState.busy}
						/>
					</CardAction>
				</CardHeader>

				<CardContent>
					{status.data.replay.task?.state === "failed" ? (
						<Alert variant="destructive">
							<Icon icon={Warning} />
							<AlertTitle>Replay failed</AlertTitle>
							<AlertDescription>
								{status.data.replay.task.outcome}
							</AlertDescription>
						</Alert>
					) : null}

					<p className="text-sm">
						{status.data.replay.receipts.toLocaleString()} source receipts ·{" "}
						{status.data.replay.candidates.toLocaleString()} contact candidates
					</p>
					<p className="text-muted-foreground text-xs">
						{status.data.replay.reviewCandidates.toLocaleString()} awaiting
						review · {status.data.replay.prohibitedCandidates.toLocaleString()}{" "}
						prohibited or excluded
					</p>
					<p className="text-muted-foreground text-xs">
						{status.data.replay.latestCandidateAt ? (
							<>
								Last candidate replayed{" "}
								<LocalRelativeTime
									date={status.data.replay.latestCandidateAt}
								/>
							</>
						) : status.data.replay.latestReceiptAt ? (
							<>
								Last receipt captured{" "}
								<LocalRelativeTime date={status.data.replay.latestReceiptAt} />
							</>
						) : (
							"No local replay receipts yet"
						)}
					</p>
					<p className="text-muted-foreground text-xs">
						Proposal-only replay is local and read-only; approve candidates
						before any CRM record changes.
					</p>
				</CardContent>
			</Card>
		</>
	);
}

function connectionState(input: {
	configured: boolean;
	connected: boolean;
	queued: boolean;
	error?: string | null;
}): ConnectionState {
	if (!input.configured)
		return { label: "Not configured", tone: "neutral", busy: false };
	if (input.error)
		return { label: "Needs attention", tone: "error", busy: false };
	if (input.queued) return { label: "Checking", tone: "info", busy: true };
	if (input.connected)
		return { label: "Connected", tone: "success", busy: false };
	return { label: "Ready", tone: "info", busy: false };
}

function agentMailOutboundCopy(input: {
	configured: boolean;
	inboxEnabled: boolean;
	outboundEnabled: boolean;
	providerPaused: boolean;
	outreachPaused: boolean;
}): string {
	if (input.providerPaused || input.outreachPaused) {
		return "Outbound paused by recovery switches; inbound checks stay read-only.";
	}
	if (!input.inboxEnabled) {
		return "Outbound paused by operator; inbound checks stay read-only.";
	}
	if (!input.configured) {
		return "Outbound unavailable until AgentMail credentials are restored.";
	}
	if (input.outboundEnabled) {
		return "Outbound available only for approved, receipted sequence steps.";
	}
	return "Outbound unavailable until the inbox is ready.";
}

function isPendingTask(state: string | null | undefined): boolean {
	return state === "queued" || state === "running" || state === "retrying";
}
