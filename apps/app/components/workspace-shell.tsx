"use client";

import { AgentPresence } from "@crm/ui/components/agent-presence";
import {
	AppShell,
	AppShellHome,
	AppShellSearch,
} from "@crm/ui/components/app-shell";
import Link from "next/link";
import { parseAsBoolean, useQueryState } from "nuqs";
import { Suspense } from "react";
import { useMobileNav } from "@/components/mobile-nav";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const SEARCH_PLACEHOLDER = "Search companies, contacts and deals…";
const CHAT_LABEL = "Ask Comp AI";

function WorkspaceHome() {
	const workspaceUrl = useWorkspaceUrl();

	return (
		<AppShellHome asChild>
			<Link
				href={workspaceUrl()}
				aria-label="Overview"
				transitionTypes={["nav-lateral"]}
			/>
		</AppShellHome>
	);
}

function WorkspaceChatLink() {
	const workspaceUrl = useWorkspaceUrl();

	return (
		<AgentPresence label={CHAT_LABEL} asChild>
			<Link href={workspaceUrl("/chat")} transitionTypes={["nav-lateral"]} />
		</AgentPresence>
	);
}

function WorkspaceSearch() {
	const [, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.switcher,
		parseAsBoolean.withDefault(false),
	);

	return (
		<AppShellSearch
			placeholder={SEARCH_PLACEHOLDER}
			onOpen={() => void setOpen(true)}
		/>
	);
}

export function WorkspaceShell({
	end,
	sidebar,
	children,
}: {
	end: React.ReactNode;
	sidebar: React.ReactNode;
	children: React.ReactNode;
}) {
	const { open, setOpen } = useMobileNav();

	return (
		<AppShell
			navOpen={open}
			onNavOpenChange={setOpen}
			product="CRM"
			home={
				<Suspense
					fallback={
						<AppShellHome asChild>
							<span />
						</AppShellHome>
					}
				>
					<WorkspaceHome />
				</Suspense>
			}
			search={
				<Suspense
					fallback={
						<AppShellSearch placeholder={SEARCH_PLACEHOLDER} disabled />
					}
				>
					<WorkspaceSearch />
				</Suspense>
			}
			agent={
				<Suspense fallback={<AgentPresence label={CHAT_LABEL} disabled />}>
					<WorkspaceChatLink />
				</Suspense>
			}
			sidebar={sidebar}
			end={end}
		>
			{children}
		</AppShell>
	);
}
