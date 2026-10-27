"use client";

import { authClient } from "@crm/auth/client";
import { MICROSOFT_SYNC_SCOPES } from "@crm/auth/scopes";
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
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@crm/ui/components/page-shell";
import { SettingRow, SettingRows } from "@crm/ui/components/setting-rows";
import { SettingsCard, SettingsColumn } from "@crm/ui/components/settings-card";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { isSyncing, SYNC_POLL_MS } from "@/lib/sync-status";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const AUTO_CREATE = "Add the company and contact when you reply to someone new";

const CONNECT_ERRORS = new Map([
	[
		"email_does_not_match",
		"That Microsoft account has a different email address to the one you sign in with, so it cannot be attached to your account. Connect the Microsoft account that matches your sign-in address.",
	],
]);

function MicrosoftHeader() {
	return (
		<PageShellHeader>
			<PageShellHeading>
				<PageShellTitle>Microsoft</PageShellTitle>
				<PageShellDescription>
					Read-only Outlook mail. Only conversations with companies in the CRM
					are stored.
				</PageShellDescription>
			</PageShellHeading>
		</PageShellHeader>
	);
}

function MicrosoftUnavailable() {
	return (
		<SettingsCard
			title="Connection"
			status={
				<StatusIndicator size="sm" tone="neutral" label="Not configured" />
			}
			description="Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in the root .env file and restart."
		/>
	);
}

function ConnectMicrosoft({
	slug,
	connectError,
}: {
	slug: string;
	connectError?: string;
}) {
	const [pending, setPending] = useState(false);

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? "Could not reach Microsoft.");
	}

	async function handleConnect() {
		setPending(true);

		const origin = window.location.origin;

		const { error } = await authClient.linkSocial({
			provider: "microsoft",
			scopes: [...MICROSOFT_SYNC_SCOPES],
			callbackURL: `${origin}/${slug}/settings/connections/microsoft`,
			errorCallbackURL: `${origin}/${slug}/settings/connections/microsoft?provider=microsoft`,
		});

		if (error) fail(error.message);
	}

	return (
		<SettingsCard
			title="Connection"
			status={
				<StatusIndicator size="sm" tone="neutral" label="Not connected" />
			}
			description="Connect the Microsoft account you sign in with."
			action={
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
						<MicrosoftLogo data-icon="inline-start" className="size-4" />
					)}
					Connect
				</Button>
			}
		>
			{connectError ? (
				<Alert variant="destructive">
					<Icon icon={CircleAlertIcon} />
					<AlertTitle>Microsoft did not finish connecting</AlertTitle>
					<AlertDescription>
						{CONNECT_ERRORS.get(connectError) ??
							"Microsoft returned an error before the connection was made. Try again."}
					</AlertDescription>
				</Alert>
			) : null}
		</SettingsCard>
	);
}

export function MicrosoftConnection({
	slug,
	connectError,
}: {
	slug: string;
	connectError?: string;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const status = useQuery({
		...trpc.microsoft.status.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.sources.some((source) => isSyncing(source.status))
				? SYNC_POLL_MS
				: false,
	});

	const purge = useMutation(
		trpc.microsoft.purgeSyncedData.mutationOptions({
			onSuccess: async (result) => {
				await cache.microsoft();
				toast.success(`Removed ${result.purged} synced items.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const revoke = useMutation(
		trpc.microsoft.revokeAccess.mutationOptions({
			onSuccess: () =>
				window.location.assign(
					status.data?.required ? "/" : `/${slug}/settings/connections`,
				),
			onError: (error) => toast.error(error.message),
		}),
	);

	const setAutoCreate = useMutation(
		trpc.microsoft.setAutoCreate.mutationOptions({
			onSuccess: () => cache.microsoft({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const syncNow = useMutation(
		trpc.microsoft.syncNow.mutationOptions({
			onSuccess: () => cache.microsoft(),
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!status.data) return <MicrosoftHeader />;

	const { sources, hasRefreshToken, configured, linked, required } =
		status.data;

	if (!configured) {
		return (
			<>
				<MicrosoftHeader />
				<MicrosoftUnavailable />
			</>
		);
	}
	if (!linked) {
		return (
			<>
				<MicrosoftHeader />
				<ConnectMicrosoft slug={slug} connectError={connectError} />
			</>
		);
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
		<>
			<MicrosoftHeader />
			<SettingsColumn>
				<SettingsCard
					title="Connection"
					status={
						<StatusIndicator
							size="sm"
							tone={healthy ? "success" : "warning"}
							label={healthy ? "Connected" : "Needs attention"}
						/>
					}
					description="Email threads land on the matching company as they happen."
					hint={
						lastSyncedAt ? (
							<>
								Last checked <LocalRelativeTime date={lastSyncedAt} />
							</>
						) : (
							"Waiting for the first check"
						)
					}
					action={
						<Button
							variant="outline"
							size="sm"
							disabled={syncNow.isPending}
							onClick={() => syncNow.mutate()}
						>
							{syncNow.isPending ? "Checking…" : "Check now"}
						</Button>
					}
				>
					{!hasRefreshToken ? (
						<Alert variant="destructive">
							<Icon icon={CircleAlertIcon} />
							<AlertTitle>Microsoft did not return a refresh token</AlertTitle>
							<AlertDescription>Sign out and back in.</AlertDescription>
						</Alert>
					) : failing.length > 0 ? (
						<div className="flex flex-col gap-3">
							{failing.map((source) => (
								<Alert key={source.source} variant="destructive">
									<Icon icon={CircleAlertIcon} />
									<AlertTitle>Email sync failed</AlertTitle>
									<AlertDescription>
										{source.lastError ?? "Microsoft needs reconnecting."}
									</AlertDescription>
								</Alert>
							))}
						</div>
					) : null}
				</SettingsCard>

				<SettingsCard
					title="New companies and contacts"
					description="Add them to the CRM when someone new shows up in a synced source."
					hint="Changes save as you make them."
				>
					<SettingRows>
						{sources.map((source) => (
							<SettingRow
								key={source.source}
								title="Email"
								description={AUTO_CREATE}
								control={(id, describedBy) => (
									<Switch
										id={id}
										aria-describedby={describedBy}
										checked={source.autoCreate}
										disabled={setAutoCreate.isPending}
										onCheckedChange={(enabled) =>
											setAutoCreate.mutate({ source: source.source, enabled })
										}
									/>
								)}
							/>
						))}
					</SettingRows>
				</SettingsCard>

				<SettingsCard
					title="Microsoft access"
					description="Stop new email from arriving."
					hint={
						<a
							href="https://myapplications.microsoft.com"
							target="_blank"
							rel="noreferrer"
						>
							Manage in your Microsoft account
						</a>
					}
					action={
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="outline" size="sm" disabled={revoke.isPending}>
									Disconnect Microsoft
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Disconnect Microsoft?</AlertDialogTitle>
									<AlertDialogDescription>
										{required
											? "You will be signed out, and you cannot use the CRM again until you grant access."
											: "New email stops arriving. Everything already synced stays, and you can connect Microsoft again from this page."}{" "}
										Remove this app from your Microsoft account to withdraw
										consent.
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
					}
				/>

				<SettingsCard
					tone="destructive"
					title="Delete synced data"
					description="Remove every email brought in from Outlook."
					hint="This can't be undone."
					action={
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									variant="destructive"
									size="sm"
									disabled={purge.isPending}
								>
									Delete synced data
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete synced data?</AlertDialogTitle>
									<AlertDialogDescription>
										Every email brought in from Outlook is removed from the CRM.
										The next check starts from now, so nothing deleted here
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
					}
				/>
			</SettingsColumn>
		</>
	);
}
