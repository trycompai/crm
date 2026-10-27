"use client";

import { authClient } from "@crm/auth/client";
import { SYNC_SCOPES } from "@crm/auth/scopes";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
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
import GoogleLogo from "@crm/ui/components/brand-logos/google";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { isSyncing, SYNC_POLL_MS } from "@/lib/sync-status";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const SOURCES = {
	calendar: {
		label: "Meetings",
		autoCreate: "Add the company and contact when you meet someone new",
	},
	gmail: {
		label: "Email",
		autoCreate: "Add the company and contact when you reply to someone new",
	},
} as const;

const RESOLVE_HOSTS = [
	"console.cloud.google.com",
	"console.developers.google.com",
	"support.google.com",
	"myaccount.google.com",
];

function resolveLink(error: string): string | undefined {
	const found = error.match(/https?:\/\/[^\s)]+/)?.[0];
	if (!found) return undefined;

	try {
		const url = new URL(found);
		const allowed =
			url.protocol === "https:" &&
			RESOLVE_HOSTS.some(
				(host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
			);
		return allowed ? url.toString() : undefined;
	} catch {
		return undefined;
	}
}

function explain(error: string) {
	return {
		summary: error.split(/(?<=\.)\s/)[0] ?? error,
		url: resolveLink(error),
	};
}

function failureSignature(
	sources: readonly {
		source: string;
		status: string | null;
		lastError: string | null;
	}[],
): string {
	const failures: string[] = [];
	for (const source of sources) {
		if (source.status === "NEEDS_RECONNECT" || source.lastError) {
			failures.push(`${source.source}:${source.lastError ?? "reconnect"}`);
		}
	}
	return failures.sort().join("|");
}

function GoogleHeader() {
	return (
		<PageShellHeader>
			<PageShellHeading>
				<PageShellTitle>Google</PageShellTitle>
				<PageShellDescription>
					Read-only Gmail and Calendar. Only conversations with companies in the
					CRM are stored.
				</PageShellDescription>
			</PageShellHeading>
		</PageShellHeader>
	);
}

function GoogleUnavailable() {
	return (
		<SettingsCard
			title="Connection"
			status={
				<StatusIndicator size="sm" tone="neutral" label="Not configured" />
			}
			description="Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the root .env file and restart."
		/>
	);
}

const CONNECT_ERRORS = new Map([
	[
		"email_doesn't_match",
		"That Google account has a different email address to the one you sign in with, so it cannot be attached to your account. Connect the Google account that matches your sign-in address.",
	],
]);

function ConnectGoogle({
	slug,
	connectError,
}: {
	slug: string;
	connectError?: string;
}) {
	const [pending, setPending] = useState(false);

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? "Could not reach Google.");
	}

	async function handleConnect() {
		setPending(true);

		const origin = window.location.origin;

		const { error } = await authClient.linkSocial({
			provider: "google",
			scopes: [...SYNC_SCOPES],
			callbackURL: `${origin}/${slug}/settings/connections/google`,
			errorCallbackURL: `${origin}/${slug}/settings/connections/google?provider=google`,
		});

		if (error) fail(error.message);
	}

	return (
		<SettingsCard
			title="Connection"
			status={
				<StatusIndicator size="sm" tone="neutral" label="Not connected" />
			}
			description="Connect the Google account you sign in with."
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
						<GoogleLogo data-icon="inline-start" className="size-4" />
					)}
					Connect
				</Button>
			}
		>
			{connectError ? (
				<Alert variant="destructive">
					<Icon icon={CircleAlertIcon} />
					<AlertTitle>Google did not finish connecting</AlertTitle>
					<AlertDescription>
						{CONNECT_ERRORS.get(connectError) ??
							"Google returned an error before the connection was made. Try again."}
					</AlertDescription>
				</Alert>
			) : null}
		</SettingsCard>
	);
}

export function GoogleConnection({
	slug,
	connectError,
}: {
	slug: string;
	connectError?: string;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const queryClient = useQueryClient();

	const status = useQuery({
		...trpc.google.status.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.sources.some((source) => isSyncing(source.status))
				? SYNC_POLL_MS
				: false,
	});

	const purge = useMutation(
		trpc.google.purgeSyncedData.mutationOptions({
			onSuccess: async (result) => {
				await cache.google();
				toast.success(`Removed ${result.purged} synced items.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const revoke = useMutation(
		trpc.google.revokeAccess.mutationOptions({
			onSuccess: () =>
				window.location.assign(
					status.data?.required ? "/" : `/${slug}/settings/connections`,
				),
			onError: (error) => toast.error(error.message),
		}),
	);

	const setAutoCreate = useMutation(
		trpc.google.setAutoCreate.mutationOptions({
			onSuccess: () => cache.google({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const [insistence, setInsistence] = useState(0);

	const syncNow = useMutation(
		trpc.google.syncNow.mutationOptions({
			onSuccess: async () => {
				const before = failureSignature(status.data?.sources ?? []);
				await cache.google();

				const after = failureSignature(
					queryClient.getQueryData(trpc.google.status.queryKey())?.sources ??
						[],
				);

				if (after && after === before) setInsistence((count) => count + 1);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!status.data) return <GoogleHeader />;

	const { sources, hasRefreshToken, configured, linked, required } =
		status.data;

	if (!configured) {
		return (
			<>
				<GoogleHeader />
				<GoogleUnavailable />
			</>
		);
	}
	if (!linked) {
		return (
			<>
				<GoogleHeader />
				<ConnectGoogle slug={slug} connectError={connectError} />
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
			<GoogleHeader />
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
					description="Meetings and email threads land on the matching company as they happen."
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
						<Alert variant="destructive" attention={insistence}>
							<Icon icon={CircleAlertIcon} />
							<AlertTitle>Google did not return a refresh token</AlertTitle>
							<AlertDescription>Sign out and back in.</AlertDescription>
						</Alert>
					) : failing.length > 0 ? (
						<div className="flex flex-col gap-3">
							{failing.map((source) => {
								const { summary, url } = explain(
									source.lastError ?? "Google needs reconnecting.",
								);

								return (
									<Alert
										key={source.source}
										variant="destructive"
										attention={insistence}
									>
										<Icon icon={CircleAlertIcon} />
										<AlertTitle>
											{SOURCES[source.source].label} sync failed
										</AlertTitle>
										<AlertDescription>{summary}</AlertDescription>

										{url ? (
											<AlertAction>
												<Button variant="contrast" size="xs" asChild>
													<a href={url} target="_blank" rel="noreferrer">
														Resolve
														<Icon
															icon={ExternalLinkIcon}
															data-icon="inline-end"
														/>
													</a>
												</Button>
											</AlertAction>
										) : null}
									</Alert>
								);
							})}
						</div>
					) : null}
				</SettingsCard>

				<SettingsCard
					title="New companies and contacts"
					description="Add them to the CRM when someone new shows up in a synced source."
					hint="Changes save as you make them."
				>
					<SettingRows>
						{sources.map((source) => {
							const copy = SOURCES[source.source];

							return (
								<SettingRow
									key={source.source}
									title={copy.label}
									description={copy.autoCreate}
									control={(id, describedBy) => (
										<Switch
											id={id}
											aria-describedby={describedBy}
											checked={source.autoCreate}
											disabled={setAutoCreate.isPending}
											onCheckedChange={(enabled) =>
												setAutoCreate.mutate({
													source: source.source,
													enabled,
												})
											}
										/>
									)}
								/>
							);
						})}
					</SettingRows>
				</SettingsCard>

				<SettingsCard
					title="Google access"
					description="Stop new email and meetings from arriving."
					hint={
						<a
							href="https://myaccount.google.com/permissions"
							target="_blank"
							rel="noreferrer"
						>
							Manage in your Google account
						</a>
					}
					action={
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="outline" size="sm" disabled={revoke.isPending}>
									Revoke access
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Revoke Google access?</AlertDialogTitle>
									<AlertDialogDescription>
										{required
											? "You will be signed out, and you cannot use the CRM again until you grant access."
											: "New email and meetings stop arriving. Everything already synced stays, and you can connect Google again from this page."}
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => revoke.mutate()}
									>
										Revoke
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					}
				/>

				<SettingsCard
					tone="destructive"
					title="Delete synced data"
					description="Remove every email and meeting brought in from Google."
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
										Every email and meeting brought in from Google is removed
										from the CRM. The next check starts from now, so nothing
										deleted here comes back.
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
