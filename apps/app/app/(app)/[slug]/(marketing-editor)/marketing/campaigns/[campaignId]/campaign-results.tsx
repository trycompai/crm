"use client";

import type { RouterOutputs } from "@/lib/trpc/types";

type Campaign = RouterOutputs["marketingCampaigns"]["byId"];

function rate(part: number, whole: number): string {
	return whole === 0 ? "—" : `${((part / whole) * 100).toFixed(1)}%`;
}

function Stat({
	label,
	value,
	note,
	tone,
}: {
	label: string;
	value: string;
	note?: string;
	tone?: "warn";
}) {
	return (
		<div className="flex flex-col gap-1 border-r px-5 py-4 last:border-r-0">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span
				className={
					tone === "warn"
						? "font-medium text-2xl text-destructive tabular-nums"
						: "font-medium text-2xl tabular-nums"
				}
			>
				{value}
			</span>
			{note ? (
				<span className="text-muted-foreground text-xs">{note}</span>
			) : null}
		</div>
	);
}

export function CampaignResults({ campaign }: { campaign: Campaign }) {
	const health = campaign.health;
	const node = campaign.stats[0];

	const bounceHigh = health.bounceRate >= 0.02;
	const complaintHigh = health.complaintRate >= 0.001;

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<div className="grid grid-cols-2 border-b md:grid-cols-4">
				<Stat label="Sent" value={health.sent.toLocaleString()} />
				<Stat
					label="Delivered"
					value={rate(health.delivered, health.sent)}
					note={`${health.delivered.toLocaleString()} of ${health.sent.toLocaleString()}`}
				/>
				<Stat
					label="Bounced"
					value={rate(health.bounced, health.sent)}
					note={bounceHigh ? "Over 2% is worth acting on" : undefined}
					tone={bounceHigh ? "warn" : undefined}
				/>
				<Stat
					label="Complaints"
					value={rate(health.complained, health.sent)}
					note={complaintHigh ? "Past what Google tolerates" : undefined}
					tone={complaintHigh ? "warn" : undefined}
				/>
			</div>

			<div className="grid grid-cols-2 border-b md:grid-cols-4">
				<Stat
					label="Opened"
					value={node ? rate(node.opened, node.sent) : "—"}
					note="Apple opens every email before a person does"
				/>
				<Stat
					label="Clicked"
					value={node ? rate(node.clicked, node.sent) : "—"}
				/>
				<Stat
					label="Replied"
					value={node ? rate(node.replied, node.sent) : "—"}
					note="From the mailbox sync"
				/>
				<Stat
					label="Unsubscribed"
					value={node ? node.unsubscribed.toLocaleString() : "—"}
				/>
			</div>

			{campaign.pausedReason ? (
				<p className="border-b px-5 py-4 text-destructive text-xs">
					{campaign.pausedReason}
				</p>
			) : null}

			<p className="px-5 py-4 text-muted-foreground text-xs">
				Open rate counts Apple Mail's prefetch, so read it as a ceiling rather
				than a measurement. Click and reply rates are people.
			</p>
		</div>
	);
}
