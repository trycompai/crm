"use client";

import { useQuery } from "@tanstack/react-query";
import {
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetSection,
} from "@/components/detail-sheet";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

type Touch = {
	source: string;
	medium: string | null;
	campaign: string | null;
	at: string | null;
};

export function WebsiteActivity({
	companyId,
	contactId,
}: {
	companyId?: string;
	contactId?: string;
}) {
	const trpc = useTRPC();

	const company = useQuery({
		...trpc.tracking.companyActivity.queryOptions({
			companyId: companyId ?? "",
		}),
		enabled: Boolean(companyId),
	});

	const contact = useQuery({
		...trpc.tracking.contactActivity.queryOptions({
			contactId: contactId ?? "",
		}),
		enabled: Boolean(contactId) && !companyId,
	});

	const activity = companyId ? company.data : contact.data;

	if (!activity?.identified) return null;
	if (activity.pages.length === 0 && !activity.firstTouch) return null;

	const topPage = activity.pages[0];
	const first = activity.firstTouch;
	const last = activity.lastTouch;
	const channelChanged =
		first != null && last != null && channel(last) !== channel(first);
	const campaign = last?.campaign ?? first?.campaign ?? null;

	return (
		<DetailSheetSection title="Website activity">
			<DetailSheetProperties>
				<DetailSheetProperty label="Page views">
					<span className="tabular-nums">
						{activity.views.toLocaleString()}
					</span>
				</DetailSheetProperty>

				{activity.lastSeenAt ? (
					<DetailSheetProperty label="Last seen">
						<LocalRelativeTime date={activity.lastSeenAt} />
					</DetailSheetProperty>
				) : null}

				{first ? (
					<DetailSheetProperty label="Original source">
						<Channel touch={first} />
					</DetailSheetProperty>
				) : null}

				{topPage ? (
					<DetailSheetProperty label="Top page">
						<span className="flex min-w-0 items-baseline gap-3">
							<span className="truncate font-mono" title={topPage.path}>
								{topPage.path}
							</span>
							<span className="shrink-0 text-muted-foreground">
								<span className="tabular-nums">{topPage.views}</span> views
							</span>
						</span>
					</DetailSheetProperty>
				) : null}

				{channelChanged ? (
					<DetailSheetProperty label="Latest source">
						<Channel touch={last} />
					</DetailSheetProperty>
				) : null}

				{first?.at ? (
					<DetailSheetProperty label="First seen">
						<LocalRelativeTime date={first.at} />
					</DetailSheetProperty>
				) : null}

				{campaign ? (
					<DetailSheetProperty label="Campaign">{campaign}</DetailSheetProperty>
				) : null}
			</DetailSheetProperties>
		</DetailSheetSection>
	);
}

function channel(touch: Touch | null): string {
	if (!touch) return "Unknown";
	if (!touch.medium || touch.medium === "direct") return touch.source;
	return `${touch.source}/${touch.medium}`;
}

function Channel({ touch }: { touch: Touch | null }) {
	if (!touch) return "Unknown";
	if (!touch.medium || touch.medium === "direct") return touch.source;
	return (
		<span className="flex min-w-0 items-baseline gap-3">
			<span>{touch.source}</span>
			<span className="text-muted-foreground">{touch.medium}</span>
		</span>
	);
}
