import Close from "@carbon/icons-react/es/Close";
import Warning from "@carbon/icons-react/es/Warning";
import {
	describeHubspotScopes,
	HUBSPOT_REQUESTED_SCOPES,
	HUBSPOT_SCOPE_GROUPS,
	type HubspotScope,
	hubspotScopeDrift,
} from "@crm/auth";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
import HubspotLogo from "@crm/ui/components/brand-logos/hubspot";
import { Icon } from "@crm/ui/components/icon";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import type { RouterOutputs } from "@/lib/trpc/types";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";
import { type ConnectionQuery, connectErrorOf } from "../oauth-connection-page";
import { ScopeGroups } from "../scope-groups";
import {
	HubspotConnectButton,
	HubspotReconnectButton,
} from "./hubspot-connect-button";
import { HubspotDisconnectButton } from "./hubspot-disconnect-button";

const SCOPE_CAPTION =
	"Broad means the whole HubSpot account, not the deals you own. Open a group to see the details.";

const WITHHELD_NOTE = "HubSpot held this one back, so it is off.";

const never = [
	"Write anything to HubSpot. Not a deal, not a note, not a stage change",
	"Read anything outside deals, their companies, their contacts and their owners",
	"Ask each person here to connect. One HubSpot account is shared by everybody",
];

type HubspotStatus = RouterOutputs["hubspot"]["status"];

type HubspotPipeline = HubspotStatus["pipelines"][number];

type HubspotConnectionPageProps = {
	params: Promise<{ slug: string }>;
	searchParams: Promise<ConnectionQuery>;
};

export default function HubspotConnectionPage(
	props: HubspotConnectionPageProps,
) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<HubspotConnectionPageContent {...props} />
		</Suspense>
	);
}

async function HubspotConnectionPageContent({
	params,
	searchParams,
}: HubspotConnectionPageProps) {
	await requireSession();
	const [{ slug }, query] = await Promise.all([params, searchParams]);
	const queryClient = getServerQueryClient();
	const status = await queryClient.fetchQuery(
		getServerTrpc().hubspot.status.queryOptions(),
	);

	return status.connected ? (
		<ConnectedHubspot slug={slug} status={status} />
	) : (
		<ConnectionPage centered className="max-w-(--container-page)">
			<header className="flex flex-col gap-3 px-(--spacing-block-inline)">
				<div className="flex items-center gap-3">
					<HubspotLogo className="size-6" />
					<h1 className="font-medium text-xl">HubSpot</h1>
					<span className="ml-auto text-muted-foreground text-sm">
						Not connected
					</span>
				</div>
				<p className="text-muted-foreground text-sm leading-relaxed">
					HubSpot decides which stage means won and which means lost, and it
					decides it per pipeline. Connecting reads that answer, so an agent
					here can say a deal closed without anyone naming a stage.
				</p>
			</header>
			<ScopeGroups
				caption={SCOPE_CAPTION}
				groups={groupScopes([...HUBSPOT_REQUESTED_SCOPES])}
				title="What you are handing over"
				withheld={[]}
				withheldNote={WITHHELD_NOTE}
			/>
			<PlainList
				title="What it will never do"
				items={never}
				icon={Close}
				tone="text-muted-foreground"
			/>
			<div className="flex items-center gap-4 border-y px-(--spacing-block-inline) py-5">
				<HubspotConnectButton
					slug={slug}
					configured={status.configured}
					connectError={connectErrorOf(query, "hubspot")}
				/>
				<p className="text-muted-foreground text-xs">
					HubSpot only lets a Super Admin, or someone with Marketplace Access,
					install an app. One install covers your whole team. You can disconnect
					it here at any time.
				</p>
			</div>
		</ConnectionPage>
	);
}

function toLine(entry: HubspotScope) {
	return {
		scope: entry.scope,
		grant: entry.grant,
		sensitive: entry.sensitive,
	};
}

function groupScopes(scopes: string[]) {
	const held = describeHubspotScopes(scopes);

	return HUBSPOT_SCOPE_GROUPS.map((group) => ({
		id: group.id,
		label: group.label,
		summary: group.summary,
		scopes: held.filter((entry) => entry.group === group.id).map(toLine),
	})).filter((group) => group.scopes.length > 0);
}

function ConnectedHubspot({
	slug,
	status,
}: {
	slug: string;
	status: HubspotStatus;
}) {
	const drift = hubspotScopeDrift(status.scopes);
	const portal = status.portalDomain ?? status.portalId;

	return (
		<ConnectionPage>
			<header className="flex flex-col gap-2 px-(--spacing-block-inline)">
				<div className="flex items-center gap-3">
					<HubspotLogo className="size-6" />
					<h1 className="font-medium text-xl">HubSpot</h1>
					<span className="ml-auto text-muted-foreground text-sm">
						{portal ?? "Connected"}
					</span>
					<HubspotDisconnectButton
						canManage={status.canManage}
						portal={portal}
					/>
				</div>
				<p className="text-muted-foreground text-sm">
					{status.canManage
						? "One HubSpot account, shared by everybody here. Nothing on this page can change HubSpot."
						: "One HubSpot account, shared by everybody here. Only an owner or an admin can disconnect it."}
				</p>
			</header>

			<Liveness slug={slug} status={status} />

			<ScopeGroups
				caption={SCOPE_CAPTION}
				groups={groupScopes(status.scopes)}
				title="What this account granted"
				withheld={drift.missing.map(toLine)}
				withheldNote={WITHHELD_NOTE}
			/>

			<Pipelines pipelines={status.pipelines} />

			<section className="flex flex-col gap-2 border-t px-(--spacing-block-inline) py-5">
				<h2 className="font-medium text-sm">Who installed it</h2>
				<p className="text-muted-foreground text-sm">
					{status.installerEmail
						? `${status.installerEmail} approved this install in HubSpot. The token acts as the app, not as them, so it reads every deal in the account.`
						: "HubSpot did not name the person who approved this install. The token acts as the app, so it reads every deal in the account."}
				</p>
			</section>
		</ConnectionPage>
	);
}

function Liveness({ slug, status }: { slug: string; status: HubspotStatus }) {
	if (status.revokedAt) {
		return (
			<div className="px-(--spacing-block-inline)">
				<Alert variant="destructive">
					<Icon icon={Warning} />
					<AlertTitle>HubSpot has revoked this install</AlertTitle>
					<AlertDescription>
						<span>
							Somebody removed the app in HubSpot, so nothing here can read it.
							Every agent that uses HubSpot has stopped. Reconnecting fixes it.
						</span>
					</AlertDescription>
					<AlertAction>
						<HubspotReconnectButton slug={slug} />
					</AlertAction>
				</Alert>
			</div>
		);
	}

	if (!status.canReadDeals) {
		return (
			<div className="px-(--spacing-block-inline)">
				<Alert variant="warning">
					<Icon icon={Warning} />
					<AlertTitle>HubSpot did not grant the deals permission</AlertTitle>
					<AlertDescription>
						<span>
							Without it nothing here can read a deal. Reconnect to ask again.
							You lose nothing.
						</span>
					</AlertDescription>
					<AlertAction>
						<HubspotReconnectButton slug={slug} />
					</AlertAction>
				</Alert>
			</div>
		);
	}

	return (
		<section className="flex flex-col gap-2 border-y px-(--spacing-block-inline) py-5">
			<h2 className="font-medium text-sm">Liveness</h2>
			<dl className="flex flex-col gap-2 text-sm">
				<Row label="Last read" value={ago(status.lastReadAt)} />
				<Row label="Connected" value={ago(status.connectedAt)} />
				<Row
					label="Last problem"
					value={
						status.lastError
							? `${status.lastError} (${ago(status.lastErrorAt)})`
							: "None"
					}
				/>
			</dl>
		</section>
	);
}

function Pipelines({ pipelines }: { pipelines: HubspotPipeline[] }) {
	return (
		<section className="flex flex-col gap-3 px-(--spacing-block-inline)">
			<div>
				<h2 className="font-medium text-sm">
					What each stage means, as HubSpot has it
				</h2>
				<p className="text-muted-foreground text-xs">
					Read from HubSpot, not typed here. A custom pipeline names its stages
					however you like; HubSpot still says which one is won.
				</p>
			</div>
			<div className="flex flex-col divide-y rounded-lg border">
				{pipelines.length === 0 ? (
					<p className="px-(--spacing-block-inline) py-4 text-muted-foreground text-sm">
						No pipelines have been read yet. The first agent that reads HubSpot
						fetches them.
					</p>
				) : null}
				{pipelines.map((pipeline) => (
					<div
						className="flex flex-col gap-2 px-(--spacing-block-inline) py-4"
						key={pipeline.id}
					>
						<h3 className="font-medium text-sm">{pipeline.label}</h3>
						<div className="flex flex-wrap gap-2">
							{pipeline.stages.map((stage) => (
								<span
									className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
									key={stage.id}
								>
									<span
										className={`size-2 rounded-full ${dot(stage.outcome)}`}
									/>
									{stage.label}
								</span>
							))}
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function dot(outcome: "OPEN" | "WON" | "LOST") {
	if (outcome === "WON") return "bg-success";
	if (outcome === "LOST") return "bg-destructive";
	return "bg-muted-foreground";
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex gap-4">
			<dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
			<dd className="min-w-0">{value}</dd>
		</div>
	);
}

function ago(value: string | null): string {
	if (!value) return "Never";

	const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000);
	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? "" : "s"} ago`;
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
