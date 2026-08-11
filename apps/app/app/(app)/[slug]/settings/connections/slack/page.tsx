import Checkmark from "@carbon/icons-react/es/Checkmark";
import Close from "@carbon/icons-react/es/Close";
import Warning from "@carbon/icons-react/es/Warning";
import {
	describeSlackScopes,
	SLACK_REQUESTED_SCOPES,
	type SlackScope,
} from "@crm/auth";
import SlackLogo from "@crm/ui/components/brand-logos/slack";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import Link from "next/link";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConnectionPage } from "../connection-page";
import { SlackConnectButton } from "./slack-connect-button";
import { SlackDisconnectButton } from "./slack-disconnect-button";

const never = [
	"Send anything at all until you build an automation and switch it on",
	"Post anywhere except the destination approved in that automation",
	"Read a direct message between two people",
];

const suggestions = [
	["When a deal is created", "Post the deal to an approved sales channel."],
	["When a deal is won", "Tell an approved channel that the deal closed."],
	["When a deal reopens", "Notify one approved channel or teammate."],
];

type SlackConnectionPageProps = {
	params: Promise<{ slug: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function SlackConnectionPage(props: SlackConnectionPageProps) {
	return (
		<Suspense
			fallback={
				<ConnectionPage centered>
					<Spinner size="lg" />
				</ConnectionPage>
			}
		>
			<SlackConnectionPageContent {...props} />
		</Suspense>
	);
}

async function SlackConnectionPageContent({
	params,
	searchParams,
}: SlackConnectionPageProps) {
	await requireSession();
	const [{ slug }, query] = await Promise.all([params, searchParams]);
	const queryClient = getServerQueryClient();
	const status = await queryClient.fetchQuery(
		getServerTrpc().slack.status.queryOptions(),
	);
	return status.connected ? (
		<ConnectedSlack slug={slug} status={status} />
	) : (
		<ConnectionPage centered className="max-w-(--container-page)">
			<header className="flex flex-col gap-3 px-(--spacing-block-inline)">
				<div className="flex items-center gap-3">
					<SlackLogo className="size-6" />
					<h1 className="font-medium text-xl">Slack</h1>
					<span className="ml-auto text-muted-foreground text-sm">
						Not connected
					</span>
				</div>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Connecting Slack gives the CRM a way in and a way out. What it
					actually does with that is up to you afterwards, one automation at a
					time.
				</p>
			</header>
			<ScopeList
				title="What you are handing over"
				scopes={describeSlackScopes(SLACK_REQUESTED_SCOPES)}
			/>
			<PlainList
				title="What it will never do"
				items={never}
				icon={Close}
				tone="text-muted-foreground"
			/>
			<div className="flex items-center gap-4 border-y px-(--spacing-block-inline) py-5">
				<SlackConnectButton
					slug={slug}
					configured={status.configured}
					connectError={
						first(query.provider) === "slack" ? first(query.error) : undefined
					}
				/>
				<p className="text-muted-foreground text-xs">
					You approve the workspace in Slack. You can disconnect it here at any
					time.
				</p>
			</div>
			<section className="flex flex-col gap-3 px-(--spacing-block-inline)">
				<div>
					<h2 className="font-medium text-sm">
						Afterwards, most teams start with one of these
					</h2>
					<p className="text-muted-foreground text-xs">
						Suggestions, not settings. None of them exist until you pick one and
						switch it on.
					</p>
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					{suggestions.map(([name, description]) => (
						<div className="rounded-lg border p-4" key={name}>
							<h3 className="font-medium text-sm">{name}</h3>
							<p className="mt-2 text-muted-foreground text-xs leading-relaxed">
								{description}
							</p>
						</div>
					))}
				</div>
			</section>
		</ConnectionPage>
	);
}

function first(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}

function ConnectedSlack({
	slug,
	status,
}: {
	slug: string;
	status: {
		workspace: string | null;
		agents: Array<{
			id: string;
			name: string;
			description: string | null;
			status: string;
		}>;
		scopes: string[];
		people: { matched: number; reviewed: number };
	};
}) {
	const agents = status.agents;
	return (
		<ConnectionPage>
			<header className="flex flex-col gap-2 px-(--spacing-block-inline)">
				<div className="flex items-center gap-3">
					<SlackLogo className="size-6" />
					<h1 className="font-medium text-xl">Slack</h1>
					<span className="ml-auto text-muted-foreground text-sm">
						{status.workspace}
					</span>
					<SlackDisconnectButton
						workspace={status.workspace ?? "this Slack workspace"}
					/>
				</div>
				<p className="text-muted-foreground text-sm">
					This workspace granted the permissions below. Deployed agents can post
					only to the destination approved in their automation.
				</p>
			</header>
			<ScopeList
				title="What this workspace granted"
				scopes={describeSlackScopes(status.scopes)}
			/>
			<section className="flex flex-col gap-3 border-y px-(--spacing-block-inline) py-5">
				<div className="flex items-end justify-between gap-4">
					<div>
						<h2 className="font-medium text-sm">Agents that use Slack</h2>
						<p className="text-muted-foreground text-xs">
							Built in chat, not here. Open one to change what it sends or
							where.
						</p>
					</div>
				</div>
				<div className="flex flex-col divide-y rounded-lg border">
					{agents.length === 0 ? (
						<p className="px-(--spacing-block-inline) py-4 text-muted-foreground text-sm">
							No deployed agents use Slack yet.
						</p>
					) : null}
					{agents.map(
						(agent: {
							id: string;
							name: string;
							description: string | null;
							status: string;
						}) => (
							<Link
								className="flex items-center gap-3 px-(--spacing-block-inline) py-4 hover:bg-muted/50"
								href={`/${slug}/agents/${agent.id}`}
								key={agent.id}
							>
								<div className="min-w-0 flex-1">
									<h3 className="font-medium text-sm">{agent.name}</h3>
									<p className="truncate text-muted-foreground text-xs">
										{agent.description}
									</p>
								</div>
								<span className="flex w-19 shrink-0 items-center gap-2 text-xs">
									<span
										className={`size-2 rounded-full ${agent.status === "LIVE" ? "bg-success" : "bg-muted-foreground"}`}
									/>
									{agent.status === "LIVE" ? "Running" : "Paused"}
								</span>
							</Link>
						),
					)}
					<Link
						className="px-(--spacing-block-inline) py-4 font-medium text-sm hover:bg-muted/50"
						href={`/${slug}/chat`}
					>
						Describe another agent in chat
					</Link>
				</div>
			</section>
			<div className="flex items-center justify-between gap-4 px-(--spacing-block-inline)">
				<p className="text-sm">
					{status.people.reviewed === 0
						? "No workspace people have been reviewed yet."
						: `${status.people.matched} of ${status.people.reviewed} reviewed people are matched.`}
				</p>
				<Button asChild variant="outline" size="sm">
					<Link href={`/${slug}/settings/connections/slack/people`}>
						Review
					</Link>
				</Button>
			</div>
		</ConnectionPage>
	);
}

function ScopeList({ title, scopes }: { title: string; scopes: SlackScope[] }) {
	const broad = scopes.filter((entry) => entry.sensitive);
	return (
		<section className="flex flex-col gap-3 px-(--spacing-block-inline)">
			<div>
				<h2 className="font-medium text-sm">{title}</h2>
				<p className="text-muted-foreground text-xs">
					{broad.length} of these {scopes.length} reach further than one
					channel. Slack decides the final list, not the CRM.
				</p>
			</div>
			<div className="flex flex-col gap-2">
				{scopes.map((entry) => (
					<div className="flex items-start gap-3 text-sm" key={entry.scope}>
						<Icon
							icon={entry.sensitive ? Warning : Checkmark}
							motion="none"
							className={`mt-0.5 size-4 shrink-0 ${entry.sensitive ? "text-warning" : "text-success"}`}
						/>
						<span>{entry.grant}</span>
					</div>
				))}
			</div>
		</section>
	);
}

function PlainList({
	title,
	items,
	icon,
	tone,
}: {
	title: string;
	items: string[];
	icon: React.ComponentType;
	tone: string;
}) {
	return (
		<section className="flex flex-col gap-3 px-(--spacing-block-inline)">
			<h2 className="font-medium text-sm">{title}</h2>
			<div className="flex flex-col gap-2">
				{items.map((item) => (
					<div className="flex items-start gap-3 text-sm" key={item}>
						<Icon
							icon={icon}
							motion="none"
							className={`mt-0.5 size-4 shrink-0 ${tone}`}
						/>
						<span>{item}</span>
					</div>
				))}
			</div>
		</section>
	);
}
