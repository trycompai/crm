"use client";

import Warning from "@carbon/icons-react/es/Warning";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
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
import LinearLogo from "@crm/ui/components/brand-logos/linear";
import SupabaseLogo from "@crm/ui/components/brand-logos/supabase";
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
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { ConnectionPage } from "./connection-page";

type AccessMode = "read_only" | "read_write";

type McpEntry = {
	slug: string;
	name: string;
	readOnlyScopes: string[];
	readWriteScopes: string[];
	connection: {
		status: "connecting" | "connected" | "error" | "disconnected";
		accessMode: AccessMode;
		grantedScopes: string[];
		connectedAt: string | null;
		lastSuccessfulCallAt: string | null;
		lastErrorCode: string | null;
	} | null;
};

type McpTool = {
	name: string;
	description: string | null;
	fingerprint: string;
	callKind: "read" | "change" | "risky";
	reviewState: "pending" | "reviewed" | "changed" | "removed";
	lastSeenAt: string;
};

const TOOL_KIND_LABEL = {
	read: "Read",
	change: "Change",
	risky: "Sensitive",
} satisfies Record<McpTool["callKind"], string>;

const TOOL_REVIEW_LABEL = {
	pending: "Needs review",
	reviewed: "Reviewed",
	changed: "Changed",
	removed: "Removed",
} satisfies Record<McpTool["reviewState"], string>;

export function McpConnection({
	slug,
	entry,
	configured,
	canManage,
	tools,
}: {
	slug: string;
	entry: McpEntry;
	configured: boolean;
	canManage: boolean;
	tools: McpTool[];
}) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [mode, setMode] = useState<AccessMode>(
		entry.connection?.accessMode ?? "read_write",
	);
	const start = useMutation(
		trpc.mcp.start.mutationOptions({
			onSuccess: ({ authorizationUrl }) => {
				window.location.assign(authorizationUrl);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const disconnect = useMutation(
		trpc.mcp.disconnect.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries(trpc.mcp.list.queryFilter());
				toast.success(`${entry.name} disconnected.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const review = useMutation(
		trpc.mcp.reviewTools.mutationOptions({
			onSuccess: () => {
				toast.success(`${entry.name} tools reviewed.`);
				router.refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const connection = entry.connection;
	const connected = connection?.status === "connected";
	const pendingTools = tools.filter((tool) => tool.reviewState === "pending");
	const pendingReads = pendingTools.filter((tool) => tool.callKind === "read");

	function connect() {
		start.mutate({
			platformSlug: entry.slug,
			accessMode: mode,
			returnPath: `/${slug}/settings/connections/${entry.slug}`,
		});
	}
	const Logo = entry.slug === "supabase" ? SupabaseLogo : LinearLogo;

	return (
		<ConnectionPage centered>
			<div className="flex flex-col gap-2 px-(--spacing-block-inline)">
				<Button asChild variant="link" className="w-fit px-0">
					<Link href={`/${slug}/settings/connections`}>
						Back to connections
					</Link>
				</Button>
				<h1 className="font-medium text-2xl tracking-tight">{entry.name}</h1>
				<p className="text-muted-foreground text-sm">
					Connect {entry.name} once. Deployed agents receive only their reviewed
					tools.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Logo className="size-5" />
						{entry.name}
					</CardTitle>
					<CardDescription>
						Choose the maximum access. Each agent receives a smaller tool grant.
					</CardDescription>
					<CardAction>
						<StatusIndicator
							size="sm"
							tone={
								connected
									? "success"
									: connection?.status === "error"
										? "error"
										: "neutral"
							}
							label={
								connected
									? "Connected"
									: connection?.status === "error"
										? "Needs attention"
										: "Not connected"
							}
						/>
					</CardAction>
				</CardHeader>

				{!configured ? (
					<CardContent>
						<Alert>
							<Icon icon={Warning} />
							<AlertTitle>MCP connections are not configured</AlertTitle>
							<AlertDescription>
								Set MCP_ENCRYPTION_KEY in the root .env file. Then restart the
								API.
							</AlertDescription>
						</Alert>
					</CardContent>
				) : null}

				{connection?.status === "error" ? (
					<CardContent>
						<Alert variant="destructive">
							<Icon icon={Warning} />
							<AlertTitle>{entry.name} needs authorization</AlertTitle>
							<AlertDescription>
								Reconnect {entry.name}. The stored access is no longer usable.
							</AlertDescription>
						</Alert>
					</CardContent>
				) : null}

				{!connected && configured && canManage ? (
					<CardContent className="flex flex-col gap-3">
						<p className="font-medium text-sm">
							What can agents do in {entry.name}?
						</p>
						<ToggleGroup
							type="single"
							variant="outline"
							spacing={0}
							value={mode}
							onValueChange={(value) => {
								if (value === "read_only" || value === "read_write")
									setMode(value);
							}}
						>
							<ToggleGroupItem value="read_only">Read only</ToggleGroupItem>
							<ToggleGroupItem value="read_write">
								Read and write
							</ToggleGroupItem>
						</ToggleGroup>
						<p className="text-muted-foreground text-sm">
							{mode === "read_only"
								? `Agents read ${entry.name} and change nothing.`
								: `Agents read ${entry.name} and make approved changes.`}
						</p>
					</CardContent>
				) : null}

				<CardFooter className="justify-end gap-2">
					{connected && canManage ? (
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="outline">Disconnect</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Disconnect {entry.name}?</AlertDialogTitle>
									<AlertDialogDescription>
										Deployed agents stop using {entry.name} immediately.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Keep connected</AlertDialogCancel>
									<AlertDialogAction
										disabled={disconnect.isPending}
										onClick={() =>
											disconnect.mutate({ platformSlug: entry.slug })
										}
									>
										{disconnect.isPending ? (
											<Spinner data-icon="inline-start" />
										) : null}
										Disconnect
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					) : null}
					{!connected && configured && canManage ? (
						<Button disabled={start.isPending} onClick={connect}>
							{start.isPending ? <Spinner data-icon="inline-start" /> : null}
							Continue to {entry.name}
						</Button>
					) : null}
				</CardFooter>
			</Card>

			{connected ? (
				<Card>
					<CardHeader>
						<CardTitle>Tool access</CardTitle>
						<CardDescription>
							Open a tool to inspect its access before review.
						</CardDescription>
						<CardAction>
							<StatusIndicator
								size="sm"
								tone={pendingTools.length > 0 ? "warning" : "success"}
								label={
									pendingTools.length > 0
										? `${pendingTools.length} need review`
										: "All reviewed"
								}
							/>
						</CardAction>
					</CardHeader>
					<CardContent>
						<Accordion type="multiple">
							{tools.map((tool) => (
								<AccordionItem key={tool.fingerprint} value={tool.fingerprint}>
									<AccordionTrigger variant="plain">
										<span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-4">
											<span className="truncate font-medium text-sm">
												{tool.name}
											</span>
											<span className="font-normal text-muted-foreground text-xs">
												{TOOL_KIND_LABEL[tool.callKind]} ·{" "}
												{TOOL_REVIEW_LABEL[tool.reviewState]}
											</span>
										</span>
									</AccordionTrigger>
									<AccordionContent className="flex flex-col items-start gap-3">
										<p className="max-w-prose text-pretty text-muted-foreground text-sm">
											{tool.description || "No description provided."}
										</p>
										{tool.reviewState === "pending" && canManage ? (
											<Button
												size="sm"
												variant="outline"
												disabled={review.isPending}
												onClick={() =>
													review.mutate({
														platformSlug: entry.slug,
														tools: [
															{
																name: tool.name,
																fingerprint: tool.fingerprint,
															},
														],
													})
												}
											>
												Review tool
											</Button>
										) : null}
									</AccordionContent>
								</AccordionItem>
							))}
						</Accordion>
					</CardContent>
					{pendingReads.length > 0 && canManage ? (
						<CardFooter className="justify-end">
							<Button
								disabled={review.isPending}
								onClick={() =>
									review.mutate({
										platformSlug: entry.slug,
										tools: pendingReads.map(({ name, fingerprint }) => ({
											name,
											fingerprint,
										})),
									})
								}
							>
								{review.isPending ? <Spinner data-icon="inline-start" /> : null}
								Review all read tools
							</Button>
						</CardFooter>
					) : null}
				</Card>
			) : null}
		</ConnectionPage>
	);
}
