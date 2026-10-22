"use client";

import OverflowMenuVertical from "@carbon/icons-react/es/OverflowMenuVertical";
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
} from "@crm/ui/components/alert-dialog";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardPanel,
	CardPanelDetail,
	CardPanelGroup,
	CardPanelGroupContent,
	CardPanelGroupHeader,
	CardPanelScroll,
	CardTitle,
	CardToolbar,
} from "@crm/ui/components/card";
import { CodeBlock } from "@crm/ui/components/code-block";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { InlineReferenceText } from "@crm/ui/components/inline-reference-text";
import { ProviderMark } from "@crm/ui/components/provider-mark";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import type { ProviderBrand } from "@crm/ui/lib/provider-brand";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { MCP_CONNECTION_STATUS } from "@/lib/mcp-connection-status";
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

type PresentedTool = {
	name: string;
	description: string | null;
	fingerprint: string;
	callKind: "read" | "change" | "risky";
	reviewState: "pending" | "reviewed" | "changed" | "removed";
	lastSeenAt: string;
	reviewLabel: string;
	presentation?: {
		prose: string;
		code?: {
			highlightedHTML?: string;
			label: string;
			value: string;
		};
	};
};

type ToolFilter = "all" | PresentedTool["callKind"];

type McpPresentation = {
	pendingReviewCount: number;
	pendingReadTools: Array<{ name: string; fingerprint: string }>;
	groups: Array<{
		kind: PresentedTool["callKind"];
		label: string;
		description: string;
		badgeVariant: "scope-read" | "scope-change" | "scope-sensitive";
		tools: PresentedTool[];
	}>;
	filters: Array<{
		value: ToolFilter;
		label: string;
		count: number;
	}>;
	overview: {
		failure: { title: string; code: string } | null;
		scopeCount: number;
		scopeGroups: Array<{
			id: string;
			label: string;
			scopes: string[];
		}>;
		permissionPanelSize: "content" | "scroll";
		defaultOpenScopeGroups: string[];
		agents: Array<{
			id: string;
			name: string;
			description: string | null;
			status: "LIVE" | "PAUSED";
			statusLabel: string;
		}>;
	} | null;
};

export function McpConnection({
	slug,
	entry,
	brand,
	configured,
	canManage,
	presentation,
}: {
	slug: string;
	entry: McpEntry;
	brand: ProviderBrand | null;
	configured: boolean;
	canManage: boolean;
	presentation: McpPresentation;
}) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [mode, setMode] = useState<AccessMode>(
		entry.connection?.accessMode ?? "read_write",
	);
	const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
	const [toolFilter, setToolFilter] = useState<ToolFilter>("all");
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
	const connecting = connection?.status === "connecting";
	const toolGroups = presentation.groups.filter(
		(group) => toolFilter === "all" || group.kind === toolFilter,
	);

	function connect() {
		start.mutate({
			platformSlug: entry.slug,
			accessMode: mode,
			returnPath: `/${slug}/settings/connections/${entry.slug}`,
		});
	}

	return (
		<ConnectionPage centered={!connected}>
			{connecting ? <ConnectionPendingRefresh /> : null}
			<div className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-2">
					<Button asChild variant="link" size="inline">
						<Link href={`/${slug}/settings/connections`}>
							Back to connections
						</Link>
					</Button>
					<h1 className="flex items-center gap-3 font-medium text-2xl tracking-tight">
						<ProviderMark
							slug={entry.slug}
							name={entry.name}
							brand={brand}
							className="size-6"
						/>
						{entry.name}
					</h1>
					<p className="text-muted-foreground text-sm">
						Deployed agents receive only reviewed tools.
					</p>
				</div>
				{connected && canManage ? (
					<div>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon-sm">
									<Icon icon={OverflowMenuVertical} />
									<span className="sr-only">More {entry.name} actions</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuGroup>
									<DropdownMenuItem
										variant="destructive"
										onSelect={() => setConfirmingDisconnect(true)}
									>
										Disconnect {entry.name}
									</DropdownMenuItem>
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				) : null}
			</div>

			{presentation.overview ? (
				<ConnectionDetails slug={slug} overview={presentation.overview} />
			) : null}

			{connecting ? (
				<Card>
					<CardContent>
						<StatusIndicator
							busy
							tone="primary"
							label={`Connecting to ${entry.name}`}
						/>
					</CardContent>
				</Card>
			) : null}

			{!connected && !connecting ? (
				<Card>
					<CardHeader>
						<CardTitle>Access</CardTitle>
						<CardDescription>
							Choose what deployed agents can do.
						</CardDescription>
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
						<CardContent>
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

					<CardFooter align="end" divider="none">
						{!connected && configured && canManage ? (
							<Button disabled={start.isPending} onClick={connect}>
								{start.isPending ? <Spinner data-icon="inline-start" /> : null}
								Continue to {entry.name}
							</Button>
						) : null}
					</CardFooter>
				</Card>
			) : null}

			{connected ? (
				<Card>
					<CardHeader>
						<CardTitle>Tool access</CardTitle>
						<CardDescription>
							{presentation.pendingReviewCount > 0
								? `${presentation.pendingReviewCount} tools need review. Open a tool to inspect it.`
								: "All tools are reviewed. Open a tool to inspect it."}
						</CardDescription>
						{presentation.pendingReadTools.length > 0 && canManage ? (
							<CardAction>
								<Button
									size="sm"
									disabled={review.isPending}
									onClick={() =>
										review.mutate({
											platformSlug: entry.slug,
											tools: presentation.pendingReadTools,
										})
									}
								>
									{review.isPending ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Review {presentation.pendingReadTools.length} read tools
								</Button>
							</CardAction>
						) : null}
					</CardHeader>
					<CardToolbar>
						<ToggleGroup
							type="single"
							variant="outline"
							size="sm"
							value={toolFilter}
							onValueChange={(value) => {
								if (
									value === "all" ||
									value === "read" ||
									value === "change" ||
									value === "risky"
								)
									setToolFilter(value);
							}}
						>
							{presentation.filters.map((filter) => (
								<ToggleGroupItem
									key={filter.value}
									value={filter.value}
									disabled={filter.value !== "all" && filter.count === 0}
								>
									{filter.label} {filter.count}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</CardToolbar>
					<CardPanel role="region" aria-label={`${entry.name} tools`}>
						<CardPanelScroll>
							{toolGroups.map((group) => (
								<CardPanelGroup key={group.kind}>
									<CardPanelGroupHeader>
										<span className="flex min-w-0 items-center gap-2">
											<Badge variant={group.badgeVariant}>{group.label}</Badge>
											<span className="truncate text-muted-foreground text-xs">
												{group.description}
											</span>
										</span>
										<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
											{group.tools.length}
										</span>
									</CardPanelGroupHeader>
									<CardPanelGroupContent>
										<Accordion type="multiple">
											{group.tools.map((tool) => (
												<AccordionItem
													key={tool.fingerprint}
													value={tool.fingerprint}
												>
													<AccordionTrigger variant="plain">
														<span className="flex min-w-0 flex-1 items-center justify-between gap-4 pr-4">
															<span className="truncate font-medium text-sm">
																{tool.name}
															</span>
															<span className="shrink-0 font-normal text-muted-foreground text-xs">
																{tool.reviewLabel}
															</span>
														</span>
													</AccordionTrigger>
													<AccordionContent layout="stack">
														<CardPanelDetail>
															<p className="whitespace-pre-wrap text-pretty wrap-break-word">
																{tool.presentation ? (
																	<InlineReferenceText>
																		{tool.presentation.prose}
																	</InlineReferenceText>
																) : (
																	tool.description || "No description provided."
																)}
															</p>
															{tool.presentation?.code ? (
																<CodeBlock
																	highlightedHTML={
																		tool.presentation.code.highlightedHTML
																	}
																	label={tool.presentation.code.label}
																>
																	{tool.presentation.code.value}
																</CodeBlock>
															) : null}
														</CardPanelDetail>
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
									</CardPanelGroupContent>
								</CardPanelGroup>
							))}
						</CardPanelScroll>
					</CardPanel>
				</Card>
			) : null}

			<AlertDialog
				open={confirmingDisconnect}
				onOpenChange={(open) => {
					if (!disconnect.isPending) setConfirmingDisconnect(open);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Disconnect {entry.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							Deployed agents stop using {entry.name} immediately.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={disconnect.isPending}>
							Keep connected
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={disconnect.isPending}
							onClick={() => disconnect.mutate({ platformSlug: entry.slug })}
						>
							{disconnect.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Disconnect {entry.name}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</ConnectionPage>
	);
}

function ConnectionPendingRefresh() {
	const router = useRouter();

	useMountEffect(() => {
		const interval = window.setInterval(
			() => router.refresh(),
			MCP_CONNECTION_STATUS.refreshMs,
		);
		return () => window.clearInterval(interval);
	});

	return null;
}

function ConnectionDetails({
	slug,
	overview,
}: {
	slug: string;
	overview: NonNullable<McpPresentation["overview"]>;
}) {
	return (
		<>
			{overview.failure ? (
				<Alert variant="destructive">
					<Icon icon={Warning} />
					<AlertTitle>{overview.failure.title}</AlertTitle>
					<AlertDescription>
						<Badge variant="mono">{overview.failure.code}</Badge>
					</AlertDescription>
				</Alert>
			) : null}
			{overview.scopeGroups.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Permissions</CardTitle>
						<CardAction>
							<span className="text-muted-foreground text-xs tabular-nums">
								{overview.scopeCount} scopes
							</span>
						</CardAction>
					</CardHeader>
					<CardPanel
						role="region"
						aria-label="Granted permissions"
						size={overview.permissionPanelSize}
					>
						<CardPanelScroll>
							<CardPanelGroupContent>
								<Accordion
									type="multiple"
									defaultValue={overview.defaultOpenScopeGroups}
								>
									{overview.scopeGroups.map((group) => (
										<AccordionItem key={group.id} value={group.id}>
											<AccordionTrigger variant="plain">
												<span className="flex min-w-0 flex-1 items-center justify-between gap-4 pr-4">
													<span className="truncate font-medium text-sm">
														{group.label}
													</span>
													<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
														{group.scopes.length}
													</span>
												</span>
											</AccordionTrigger>
											<AccordionContent>
												<ul className="flex flex-wrap gap-2">
													{group.scopes.map((scope) => (
														<li key={scope}>
															<Badge variant="mono">{scope}</Badge>
														</li>
													))}
												</ul>
											</AccordionContent>
										</AccordionItem>
									))}
								</Accordion>
							</CardPanelGroupContent>
						</CardPanelScroll>
					</CardPanel>
				</Card>
			) : null}
			{overview.agents.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Used by</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-col divide-y rounded-md border">
							{overview.agents.map((agent) => (
								<Link
									className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
									href={`/${slug}/agents/${agent.id}`}
									key={agent.id}
								>
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium text-xs">
											{agent.name}
										</span>
										{agent.description ? (
											<span className="block truncate text-muted-foreground text-xs">
												{agent.description}
											</span>
										) : null}
									</span>
									<Badge variant="outline">{agent.statusLabel}</Badge>
								</Link>
							))}
						</div>
					</CardContent>
				</Card>
			) : null}
		</>
	);
}
