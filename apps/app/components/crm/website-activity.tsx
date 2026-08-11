"use client";

import { useQuery } from "@tanstack/react-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

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
		enabled: Boolean(contactId),
	});

	const activity = companyId ? company.data : contact.data;

	if (!activity?.identified) return null;
	if (activity.pages.length === 0 && !activity.firstTouch) return null;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<span className="font-medium text-sm tabular-nums">
					{activity.views.toLocaleString()} page views
				</span>
				{activity.lastSeenAt ? (
					<span className="text-muted-foreground text-xs">
						Last seen <LocalRelativeTime date={activity.lastSeenAt} />
					</span>
				) : null}
			</div>

			{activity.firstTouch ? (
				<dl className="flex flex-col gap-2 border-b pb-3">
					<Touch label="Original source" touch={activity.firstTouch} />
					{activity.lastTouch &&
					activity.lastTouch.label !== activity.firstTouch.label ? (
						<Touch label="Latest source" touch={activity.lastTouch} />
					) : null}
				</dl>
			) : null}

			<ul className="flex flex-col">
				{activity.pages.map((page) => (
					<li
						key={`${page.host}${page.path}`}
						className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0"
					>
						<span className="min-w-0 truncate font-mono text-xs">
							{page.path}
						</span>
						<span className="flex shrink-0 items-center gap-3 text-muted-foreground text-xs">
							<LocalRelativeTime date={page.lastSeenAt} />
							<span className="w-8 text-right tabular-nums">{page.views}</span>
						</span>
					</li>
				))}
			</ul>

			<p className="text-muted-foreground text-xs/relaxed">
				Only visits from people who have submitted a form are counted here.
				Anonymous traffic is not attributed to anybody.
			</p>
		</div>
	);
}

function Touch({
	label,
	touch,
}: {
	label: string;
	touch: {
		label: string;
		campaign: string | null;
		landing: string | null;
		at: string | null;
	};
}) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<dt className="shrink-0 text-muted-foreground text-xs">{label}</dt>
			<dd className="flex min-w-0 flex-col items-end gap-0.5 text-right">
				<span className="truncate text-xs">{touch.label}</span>
				{touch.landing || touch.at ? (
					<span className="truncate text-muted-foreground text-xs">
						{touch.landing ? (
							<span className="font-mono">{touch.landing}</span>
						) : null}
						{touch.landing && touch.at ? " · " : null}
						{touch.at ? <LocalRelativeTime date={touch.at} /> : null}
					</span>
				) : null}
			</dd>
		</div>
	);
}
