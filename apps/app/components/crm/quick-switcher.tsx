"use client";

import Task from "@carbon/icons-react/es/Task";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@crm/ui/components/command";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { showWorkNavigation } from "@/components/crm/quick-switcher-navigation";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const GROUP_LABEL = {
	company: "Companies",
	contact: "Contacts",
	deal: "Deals",
} as const;

const KINDS = ["company", "contact", "deal"] as const;

export function QuickSwitcher() {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();

	const [open, setOpen] = useQueryState("k", parseAsBoolean.withDefault(false));
	const [query, setQuery] = useState("");

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				void setOpen((current) => (current ? null : true));
			}
		};

		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [setOpen]);

	const results = useQuery({
		...trpc.search.quick.queryOptions({ q: query }),
		enabled: open && query.trim().length >= 2,
		placeholderData: (previous) => previous,
	});

	const hits = results.data?.hits ?? [];

	const go = (kind: (typeof KINDS)[number], id: string) => {
		setQuery("");
		void setOpen(null);
		openRecord({ kind, id });
	};

	const goWork = () => {
		setQuery("");
		void setOpen(null);
		router.push(workspaceUrl("/work"));
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={(next) => setOpen(next || null)}
			title="Search"
			description="Jump to work, a company, contact or deal"
		>
			<Command shouldFilter={false}>
				<CommandInput
					placeholder="Search companies, contacts and deals…"
					value={query}
					onValueChange={setQuery}
				/>
				<CommandList>
					{showWorkNavigation(query) ? (
						<CommandGroup heading="Navigation">
							<CommandItem value="work" onSelect={goWork}>
								<Task />
								<span>Work</span>
							</CommandItem>
						</CommandGroup>
					) : null}
					<CommandEmpty>
						{query.trim().length < 2
							? "Type at least two characters."
							: "Nothing matches."}
					</CommandEmpty>

					{KINDS.map((kind) => {
						const group = hits.filter((hit) => hit.kind === kind);
						if (group.length === 0) return null;

						return (
							<CommandGroup key={kind} heading={GROUP_LABEL[kind]}>
								{group.map((hit) => (
									<CommandItem
										key={`${hit.kind}:${hit.id}`}
										value={`${hit.kind}:${hit.id}`}
										onSelect={() => go(kind, hit.id)}
									>
										{hit.kind === "contact" ? (
											<PersonAvatar
												src={hit.imageUrl}
												name={hit.label}
												size="sm"
											/>
										) : (
											<EntityLogo
												src={hit.iconUrl}
												darkSrc={hit.iconDarkUrl}
												tone={hit.iconTone as EntityLogoTone | null | undefined}
												name={hit.label}
												size="sm"
											/>
										)}
										<span className="flex min-w-0 flex-col">
											<span className="truncate">{hit.label}</span>
											{hit.detail ? (
												<span className="truncate text-muted-foreground text-xs">
													{hit.detail}
												</span>
											) : null}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						);
					})}
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
