"use client";

import Renew from "@carbon/icons-react/es/Renew";
import Warning from "@carbon/icons-react/es/Warning";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { WaitingForYou } from "@/components/marketing/waiting-for-you";
import { describeMissing } from "@/lib/marketing-setup-steps";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { CampaignStatus } from "./campaign-status";

const ERROR_TITLE = "We could not load your marketing numbers";
const ERROR_BODY =
	"Your campaigns keep running. Try again in a moment, before you change anything.";
const STALE_TITLE = "These numbers are out of date";
const STALE_BODY =
	"These numbers did not refresh. They show the last successful load.";
const RETRY = "Try again";

function Stat({
	label,
	value,
	note,
}: {
	label: string;
	value: string;
	note?: string;
}) {
	return (
		<div className="flex flex-col gap-1 border-r px-5 py-4 last:border-r-0">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="font-medium text-2xl tabular-nums">{value}</span>
			{note ? (
				<span className="text-muted-foreground text-xs">{note}</span>
			) : null}
		</div>
	);
}

export function MarketingOverview() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const overview = useQuery(trpc.marketingCampaigns.overview.queryOptions());

	if (overview.isPending) return <Spinner />;

	const data = overview.data;

	if (!data) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Icon icon={Warning} />
					</EmptyMedia>
					<EmptyTitle>{ERROR_TITLE}</EmptyTitle>
					<EmptyDescription>
						{overview.error?.message ?? ERROR_BODY}
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button
						variant="outline"
						disabled={overview.isFetching}
						onClick={() => overview.refetch()}
					>
						<Icon icon={Renew} data-icon="inline-start" />
						{RETRY}
					</Button>
				</EmptyContent>
			</Empty>
		);
	}

	const days = data.thirtyDays;

	return (
		<div className="flex max-w-4xl flex-col gap-6">
			<WaitingForYou />

			{overview.isError ? (
				<Alert variant="warning">
					<Icon icon={Warning} />
					<AlertTitle>{STALE_TITLE}</AlertTitle>
					<AlertDescription>{STALE_BODY}</AlertDescription>
					<AlertAction>
						<Button
							variant="outline"
							size="xs"
							disabled={overview.isFetching}
							onClick={() => overview.refetch()}
						>
							<Icon icon={Renew} data-icon="inline-start" />
							{RETRY}
						</Button>
					</AlertAction>
				</Alert>
			) : null}

			{data.sendable ? null : (
				<div className="flex flex-col gap-3 rounded-lg border p-5">
					<span className="font-medium text-xs">Marketing cannot send yet</span>
					<span className="text-muted-foreground text-xs">
						Still to do: {describeMissing(data.missing)}.
					</span>
					<Button asChild size="sm" className="self-start">
						<Link href={workspaceUrl("/marketing/setup/connect")}>
							Finish setting up
						</Link>
					</Button>
				</div>
			)}

			<div className="grid grid-cols-2 overflow-clip rounded-lg border md:grid-cols-4">
				<Stat
					label="Running"
					value={data.live.toLocaleString()}
					note="campaigns"
				/>
				<Stat
					label="In progress"
					value={data.inFlight.toLocaleString()}
					note="people in a sequence"
				/>
				<Stat
					label="Sent"
					value={days.sent.toLocaleString()}
					note="last 30 days"
				/>
				<Stat
					label="Bounced"
					value={days.sent > 0 ? `${(days.bounceRate * 100).toFixed(1)}%` : "—"}
					note={
						days.bounceRate >= 0.02
							? "Over 2% is worth acting on"
							: "last 30 days"
					}
				/>
			</div>

			<div className="flex flex-col overflow-clip rounded-lg border">
				<div className="flex items-center justify-between border-b bg-muted px-4 py-2.5">
					<span className="font-medium text-xs">Recently updated</span>
					<Link
						href={workspaceUrl("/marketing/campaigns")}
						className="text-muted-foreground text-xs underline"
						prefetch
					>
						All campaigns
					</Link>
				</div>

				{data.recent.length === 0 ? (
					<p className="px-4 py-8 text-center text-muted-foreground text-xs">
						Nothing yet. A blast goes to a segment once. A sequence follows up
						over weeks and branches.
					</p>
				) : (
					data.recent.map((campaign) => (
						<Link
							key={campaign.id}
							href={workspaceUrl(`/marketing/campaigns/${campaign.id}`)}
							prefetch
							className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-muted"
						>
							<span className="min-w-0 flex-1 truncate text-xs">
								{campaign.name}
							</span>
							<span className="shrink-0 text-muted-foreground text-xs">
								{campaign.kind === "DRIP" ? "Sequence" : "Blast"}
							</span>
							<span className="w-20 shrink-0 text-xs">
								<CampaignStatus status={campaign.status} />
							</span>
						</Link>
					))
				)}
			</div>

			<p className="text-muted-foreground text-xs">
				Open rate is not here on purpose. Apple Mail opens every email before a
				person does, so a headline open rate is a number nobody should plan
				against. Replies and clicks live on each campaign.
			</p>
		</div>
	);
}
