import GoogleLogo from "@crm/ui/components/brand-logos/google";
import HubspotLogo from "@crm/ui/components/brand-logos/hubspot";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import SlackLogo from "@crm/ui/components/brand-logos/slack";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { AddConnectionDialog } from "./add-connection-dialog";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsSettingsPage(
	props: PageProps<"/[slug]/settings/connections">,
) {
	return (
		<Suspense fallback={<ConnectionsFallback />}>
			<ConnectionsSettingsPageContent {...props} />
		</Suspense>
	);
}

async function ConnectionsSettingsPageContent({
	params,
	searchParams,
}: PageProps<"/[slug]/settings/connections">) {
	await requireSession();
	const [{ slug }, query] = await Promise.all([params, searchParams]);
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();
	const [google, microsoft, slack, hubspot] = await Promise.all([
		queryClient.fetchQuery(trpc.google.status.queryOptions()),
		queryClient.fetchQuery(trpc.microsoft.status.queryOptions()),
		queryClient.fetchQuery(trpc.slack.status.queryOptions()),
		queryClient.fetchQuery(trpc.hubspot.status.queryOptions()),
	]);
	const rows = [
		...(google.linked
			? [
					{
						name: "Google Workspace",
						status: "Connected",
						bringsIn: "Emails, meetings and the people on them",
						sends: "Nothing yet",
						href: `/${slug}/settings/connections/google`,
						logo: GoogleLogo,
					},
				]
			: []),
		...(slack.connected
			? [
					{
						name: "Slack",
						status: slack.workspace
							? `Connected to ${slack.workspace}`
							: "Connected",
						bringsIn: "Workspace members and channels the app has joined",
						sends: "Messages to approved channels and people",
						href: `/${slug}/settings/connections/slack`,
						logo: SlackLogo,
					},
				]
			: []),
		...(hubspot.connected
			? [
					{
						name: "HubSpot",
						status: hubspot.revokedAt
							? "Access revoked in HubSpot"
							: `Connected to ${hubspot.portalDomain ?? hubspot.portalId}`,
						bringsIn:
							"Every deal in the account, and which stage of which pipeline means won or lost",
						sends: "Nothing, so nothing here can change HubSpot",
						href: `/${slug}/settings/connections/hubspot`,
						logo: HubspotLogo,
					},
				]
			: []),
		...(microsoft.linked
			? [
					{
						name: "Microsoft 365",
						status: "Connected",
						bringsIn: "Outlook email and the people on it",
						sends: "Nothing yet",
						href: `/${slug}/settings/connections/microsoft`,
						logo: MicrosoftLogo,
					},
				]
			: []),
	];

	return (
		<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-(--spacing-page-inline) pt-(--spacing-page-top) pb-(--spacing-page-bottom)">
			{rows.length > 0 ? (
				<div className="mx-auto flex w-full max-w-(--container-page) flex-col gap-(--spacing-page-gap)">
					<header className="flex items-start justify-between gap-4 px-(--spacing-block-inline)">
						<div className="flex flex-col gap-2">
							<h1 className="font-medium text-2xl tracking-tight">
								Connections
							</h1>
							<p className="max-w-2xl text-muted-foreground text-sm">
								Where your CRM gets its information, and what it is allowed to
								send on your behalf.
							</p>
						</div>
						<Button asChild variant="outline">
							<Link href={`/${slug}/settings/connections?add=1`}>
								Add connection
							</Link>
						</Button>
					</header>
					<div className="flex flex-col gap-3">
						{rows.map((row) => (
							<ConnectionCard key={row.name} {...row} />
						))}
					</div>
				</div>
			) : (
				<div className="mx-auto flex w-full max-w-(--container-narrow) flex-1 flex-col justify-center gap-(--spacing-page-gap) text-center">
					<div className="flex flex-col gap-2 px-(--spacing-block-inline)">
						<h1 className="font-medium text-2xl tracking-tight">
							Nothing is connected yet
						</h1>
						<p className="text-muted-foreground text-sm leading-relaxed">
							Right now every deal, contact and note has to be typed in by hand.
							Connect a tool and the CRM starts filling itself in from the work
							your team already does.
						</p>
					</div>
					<div className="flex flex-col divide-y rounded-lg border bg-card px-(--spacing-block-inline)">
						<StarterRow
							logo={GoogleLogo}
							name="Google Workspace"
							description="File email and meetings against the right company"
							href={`/${slug}/settings/connections/google`}
						/>
						<StarterRow
							logo={SlackLogo}
							name="Slack"
							description="Let deployed agents notify approved channels and people"
							href={`/${slug}/settings/connections/slack`}
						/>
						<StarterRow
							logo={HubspotLogo}
							name="HubSpot"
							description="Read which deals HubSpot records as won and as lost"
							href={`/${slug}/settings/connections/hubspot`}
						/>
						<StarterRow
							logo={MicrosoftLogo}
							name="Microsoft 365"
							description="File Outlook email against the right company"
							href={`/${slug}/settings/connections/microsoft`}
						/>
					</div>
					<p className="px-(--spacing-block-inline) text-muted-foreground text-sm">
						Looking for something else?{" "}
						<Link
							className="font-medium text-foreground underline underline-offset-4"
							href={`/${slug}/settings/connections?add=1`}
						>
							Browse all connections
						</Link>
					</p>
				</div>
			)}
			<AddConnectionDialog
				slug={slug}
				open={first(query.add) === "1"}
				connected={rows.map((row) => row.name)}
			/>
		</main>
	);
}

function ConnectionsFallback() {
	return (
		<main className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-(--spacing-page-inline) pt-(--spacing-page-top) pb-(--spacing-page-bottom)">
			<Spinner size="lg" />
		</main>
	);
}

function ConnectionCard({
	name,
	status,
	bringsIn,
	sends,
	href,
	logo: Logo,
}: {
	name: string;
	status: string;
	bringsIn: string;
	sends: string;
	href: string;
	logo: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
	return (
		<section className="flex flex-col gap-4 rounded-lg border bg-card px-(--spacing-block-inline) py-4">
			<div className="flex items-center gap-3">
				<Logo className="size-5 shrink-0" />
				<h2 className="font-medium text-sm">{name}</h2>
				<p className="ml-auto text-right text-muted-foreground text-xs">
					{status}
				</p>
				<Button asChild size="sm" variant="outline">
					<Link href={href}>Manage</Link>
				</Button>
			</div>
			<div className="flex flex-col gap-2 pl-8 text-sm">
				<CapabilityRow label="Brings in" value={bringsIn} />
				<CapabilityRow label="Sends" value={sends} />
			</div>
		</section>
	);
}

function CapabilityRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex gap-4">
			<span className="w-22 shrink-0 text-muted-foreground">{label}</span>
			<span>{value}</span>
		</div>
	);
}

function StarterRow({
	logo: Logo,
	name,
	description,
	href,
}: {
	logo: React.ComponentType<React.SVGProps<SVGSVGElement>>;
	name: string;
	description: string;
	href: string;
}) {
	return (
		<div className="flex items-center gap-3 py-4 text-left">
			<Logo className="size-5 shrink-0" />
			<div className="min-w-0 flex-1">
				<h2 className="font-medium text-sm">{name}</h2>
				<p className="text-muted-foreground text-xs">{description}</p>
			</div>
			<Button asChild variant="outline" size="sm">
				<Link href={href}>Connect</Link>
			</Button>
		</div>
	);
}

function first(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}
