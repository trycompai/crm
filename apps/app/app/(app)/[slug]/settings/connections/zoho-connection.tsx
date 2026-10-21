"use client";

import Warning from "@carbon/icons-react/es/Warning";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
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
import ZohoLogo from "@crm/ui/components/brand-logos/zoho";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { startMailboxGrant } from "@/lib/mailbox-oauth";
import { isSyncing, SYNC_POLL_MS } from "@/lib/sync-status";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const AUTO_CREATE = "Add the company and contact when you reply to someone new";

const CONNECT_ERRORS = new Map([
	[
		"email_doesn't_match",
		"That Zoho account has a different email address to the one you sign in with, so it cannot be attached to your account. Connect the Zoho account that matches your sign-in address.",
	],
]);

function ZohoUnavailable() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Zoho Mail
						<StatusIndicator size="sm" tone="neutral" label="Not configured" />
					</div>
				</CardTitle>
				<CardDescription>
					Set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET in the root .env file and
					restart.
				</CardDescription>
			</CardHeader>
		</Card>
	);
}

function ConnectZoho({
	slug,
	connectError,
}: {
	slug: string;
	connectError?: string;
}) {
	const [pending, setPending] = useState(false);

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? "Could not reach Zoho.");
	}

	async function handleConnect() {
		setPending(true);

		const origin = window.location.origin;

		const { error } = await startMailboxGrant("zoho", {
			callbackURL: `${origin}/${slug}/settings/connections/zoho`,
			errorCallbackURL: `${origin}/${slug}/settings/connections/zoho?provider=zoho`,
		});

		if (error) fail(error.message);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Zoho Mail
						<StatusIndicator size="sm" tone="neutral" label="Not connected" />
					</div>
				</CardTitle>
				<CardDescription>
					Read-only Zoho Mail. Only conversations with companies in the CRM are
					stored.
				</CardDescription>

				<CardAction>
					<Button
						size="sm"
						disabled={pending}
						onClick={() => {
							handleConnect().catch(() => fail());
						}}
						type="button"
					>
						{pending ? (
							<Spinner data-icon="inline-start" />
						) : (
							<ZohoLogo data-icon="inline-start" className="size-4" />
						)}
						Connect
					</Button>
				</CardAction>
			</CardHeader>

			{connectError ? (
				<CardContent>
					<Alert variant="destructive">
						<Icon icon={Warning} />
						<AlertTitle>Zoho did not finish connecting</AlertTitle>
						<AlertDescription>
							{CONNECT_ERRORS.get(connectError) ??
								"Zoho returned an error before the connection was made. Try again."}
						</AlertDescription>
					</Alert>
				</CardContent>
			) : null}
		</Card>
	);
}

export function ZohoConnection({
	slug,
	connectError,
}: {
	slug: string;
	connectError?: string;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const status = useQuery({
		...trpc.zoho.status.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.sources.some((source) => isSyncing(source.status))
				? SYNC_POLL_MS
				: false,
	});

	const purge = useMutation(
		trpc.zoho.purgeSyncedData.mutationOptions({
			onSuccess: async (result) => {
				await cache.zoho();
				toast.success(`Removed ${result.purged} synced items.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const revoke = useMutation(
		trpc.zoho.revokeAccess.mutationOptions({
			onSuccess: () =>
				window.location.assign(
					status.data?.required ? "/" : `/${slug}/settings/connections`,
				),
			onError: (error) => toast.error(error.message),
		}),
	);

	const setAutoCreate = useMutation(
		trpc.zoho.setAutoCreate.mutationOptions({
			onSuccess: () => cache.zoho({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const syncNow = useMutation(
		trpc.zoho.syncNow.mutationOptions({
			onSuccess: () => cache.zoho(),
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!status.data) return null;

	const { sources, hasRefreshToken, configured, linked, required } =
		status.data;

	if (!configured) return <ZohoUnavailable />;
	if (!linked) {
		return <ConnectZoho slug={slug} connectError={connectError} />;
	}

	const failing = sources.filter(
		(source) => source.status === "NEEDS_RECONNECT" || source.lastError,
	);
	const lastSyncedAt = sources
		.map((source) => source.lastSyncedAt)
		.filter((at): at is string => at !== null)
		.sort()
		.at(-1);

	const healthy = failing.length === 0 && hasRefreshToken;

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Zoho Mail
						<StatusIndicator
							size="sm"
							tone={healthy ? "success" : "warning"}
							label={healthy ? "Connected" : "Needs attention"}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					Email threads land on the matching company as they happen.
				</CardDescription>

				<CardAction>
					<Button
						variant="contrast"
						size="sm"
						disabled={syncNow.isPending}
						onClick={() => syncNow.mutate()}
					>
						{syncNow.isPending ? "Checking…" : "Check now"}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				{!hasRefreshToken ? (
					<Alert variant="destructive">
						<Icon icon={Warning} />
						<AlertTitle>Zoho did not return a refresh token</AlertTitle>
						<AlertDescription>
							Disconnect and reconnect — Zoho only issues one while the consent
							screen is being shown.
						</AlertDescription>
					</Alert>
				) : failing.length > 0 ? (
					failing.map((source) => (
						<Alert key={source.source} variant="destructive">
							<Icon icon={Warning} />
							<AlertTitle>Email sync failed</AlertTitle>
							<AlertDescription>
								{source.lastError ?? "Zoho needs reconnecting."}
							</AlertDescription>
						</Alert>
					))
				) : (
					<p className="text-muted-foreground text-xs">
						{lastSyncedAt ? (
							<>
								Last checked <LocalRelativeTime date={lastSyncedAt} />
							</>
						) : (
							"Waiting for the first check"
						)}
					</p>
				)}

				{sources.map((source) => (
					<div
						key={source.source}
						className="flex items-center justify-between gap-6"
					>
						<Label
							htmlFor={`auto-create-${source.source}`}
							className="flex flex-col items-start gap-1"
						>
							<span className="text-sm">Email</span>
							<span className="font-normal text-muted-foreground text-xs">
								{AUTO_CREATE}
							</span>
						</Label>

						<Switch
							id={`auto-create-${source.source}`}
							checked={source.autoCreate}
							disabled={setAutoCreate.isPending}
							onCheckedChange={(enabled) =>
								setAutoCreate.mutate({ source: source.source, enabled })
							}
						/>
					</div>
				))}

				<CardFooter>
					<div className="-ml-2 flex flex-wrap items-center gap-1 text-muted-foreground">
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="ghost" size="xs" disabled={purge.isPending}>
									Delete synced data
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete synced data?</AlertDialogTitle>
									<AlertDialogDescription>
										Every email brought in from Zoho Mail is removed from the
										CRM. The next check starts from now, so nothing deleted here
										comes back.
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => purge.mutate()}
									>
										Delete
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="ghost" size="xs" disabled={revoke.isPending}>
									Disconnect Zoho
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Disconnect Zoho?</AlertDialogTitle>
									<AlertDialogDescription>
										{required
											? "You will be signed out, and you cannot use the CRM again until you grant access."
											: "New email stops arriving. Everything already synced stays, and you can connect Zoho again from this page."}{" "}
										The stored tokens are cleared here — revoke the app from
										your Zoho account to withdraw consent at Zoho's end too.
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => revoke.mutate()}
									>
										Disconnect
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<Button variant="ghost" size="xs" asChild>
							<Link
								href="https://accounts.zoho.com/home#sessions/userconnectedapps"
								target="_blank"
								rel="noreferrer"
							>
								Manage in your Zoho account
							</Link>
						</Button>
					</div>
				</CardFooter>
			</CardContent>
		</Card>
	);
}
