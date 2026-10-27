"use client";

import { Button } from "@crm/ui/components/button";
import {
	Command,
	CommandDialog,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@crm/ui/components/command";
import { Kbd, KbdGroup } from "@crm/ui/components/kbd";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { cn } from "@crm/ui/lib/utils";
import { defaultFilter } from "cmdk";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	ChevronRightIcon,
	CornerDownLeftIcon,
	type LucideIcon,
} from "lucide-react";
import {
	Fragment,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	useCallback,
	useEffectEvent,
	useRef,
	useState,
} from "react";

export type CommandSearchItem = {
	id: string;
	label: string;
	group: string;
	icon?: LucideIcon;
	media?: ReactNode;
	path?: string[];
	snippet?: string;
	keywords?: string[];
	shortcut?: string;
	onSelect: () => void;
};

type Entry = {
	item: CommandSearchItem;
	value: string;
	result: boolean;
};

type Group = { heading: string; entries: Entry[]; result: boolean };

function movesSelection(event: ReactKeyboardEvent) {
	return (
		["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
		(event.ctrlKey && ["n", "j", "p", "k"].includes(event.key))
	);
}

function keepKeys(event: ReactKeyboardEvent) {
	if (event.key === "Enter" || event.key === " ") event.stopPropagation();
}

function groupEntries(entries: Entry[]): Group[] {
	const groups = new Map<string, Entry[]>();

	for (const entry of entries) {
		const group = groups.get(entry.item.group) ?? [];
		group.push(entry);
		groups.set(entry.item.group, group);
	}

	return [...groups].map(([heading, grouped]) => ({
		heading,
		entries: grouped,
		result: grouped[0]?.result ?? false,
	}));
}

function itemScore(item: CommandSearchItem, query: string) {
	return defaultFilter(`${item.group} ${item.label}`, query, item.keywords);
}

function queryWords(query: string) {
	return [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))].sort(
		(a, b) => b.length - a.length,
	);
}

function Marked({ text, words }: { text: string; words: string[] }) {
	if (words.length === 0) return text;

	const pattern = new RegExp(
		`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
		"giu",
	);

	let offset = 0;

	return text.split(pattern).map((part, index) => {
		const key = `${offset}-${offset + part.length}`;
		offset += part.length;

		return index % 2 === 1 ? (
			<mark
				className="rounded-xs bg-status-success/15 font-medium text-foreground"
				key={key}
			>
				{part}
			</mark>
		) : (
			<Fragment key={key}>{part}</Fragment>
		);
	});
}

function Row({
	entry,
	words,
	first,
	onSelect,
}: {
	entry: Entry;
	words: string[];
	first?: (node: HTMLDivElement | null) => void;
	onSelect: () => void;
}) {
	const { item } = entry;
	const lines = Boolean(item.path || item.snippet);
	const Glyph = item.icon;

	return (
		<CommandItem onSelect={onSelect} ref={first} value={entry.value}>
			{item.media ? (
				<span
					aria-hidden
					className={cn(
						"flex w-6 shrink-0 justify-center",
						lines && "mt-0.5 self-start",
					)}
				>
					{item.media}
				</span>
			) : Glyph ? (
				<Glyph
					aria-hidden
					className={cn("text-muted-foreground", lines && "mt-0.5 self-start")}
				/>
			) : null}
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate">
					<Marked text={item.label} words={words} />
				</span>
				{item.path ? (
					<span className="flex items-center gap-1 text-muted-foreground text-xs">
						{item.path.map((part, index) => (
							<span className="flex items-center gap-1" key={part}>
								{index > 0 ? (
									<ChevronRightIcon aria-hidden className="size-3" />
								) : null}
								{part}
							</span>
						))}
					</span>
				) : null}
				{item.snippet ? (
					<span className="truncate text-muted-foreground text-xs">
						<Marked text={item.snippet} words={words} />
					</span>
				) : null}
			</span>
			{item.shortcut ? (
				<CommandShortcut>{item.shortcut}</CommandShortcut>
			) : null}
		</CommandItem>
	);
}

function toEntries(
	items: CommandSearchItem[],
	result: boolean,
	seen: Set<string>,
) {
	return items.map((item) => {
		const base = `${result ? "result" : "item"}:${item.id}`;
		let value = base;

		for (let count = 2; seen.has(value); count += 1) value = `${base}#${count}`;

		seen.add(value);

		return { item, value, result };
	});
}

function CommandSearch({
	open,
	onOpenChange,
	items,
	results,
	onQueryChange,
	loading = false,
	searchError,
	onRetry,
	workspaceName,
	title = "Search",
	description = "Search records, pages, settings and actions.",
	placeholder = "Search records, pages and actions…",
	loadingLabel = "Searching…",
	emptyLabel = "Nothing matches that.",
	retryLabel = "Try again",
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: CommandSearchItem[];
	results?: CommandSearchItem[];
	onQueryChange?: (query: string) => void;
	loading?: boolean;
	searchError?: string;
	onRetry?: () => void;
	workspaceName?: string;
	title?: string;
	description?: string;
	placeholder?: string;
	loadingLabel?: string;
	emptyLabel?: string;
	retryLabel?: string;
}) {
	const [query, setQuery] = useState("");
	const moved = useRef(false);
	const selectingFirst = useRef(false);
	const question = query.trim();
	const words = queryWords(question);

	const seen = new Set<string>();
	const resultEntries = question ? toEntries(results ?? [], true, seen) : [];
	const itemEntries = toEntries(items, false, seen);
	const groups = [...groupEntries(resultEntries), ...groupEntries(itemEntries)];

	const count =
		resultEntries.length +
		(query
			? itemEntries.filter((entry) => itemScore(entry.item, query) > 0).length
			: itemEntries.length);

	const ranks = new Map(
		resultEntries.map((entry, index) => [entry.value, index]),
	);

	const byValue = new Map(
		itemEntries.map((entry) => [entry.value, entry.item]),
	);

	const filter = (value: string, search: string) => {
		const rank = ranks.get(value);

		if (rank !== undefined) return 2 - rank / (ranks.size + 1);

		const item = byValue.get(value);

		return item ? itemScore(item, search) : 0;
	};

	const firstResult = resultEntries[0]?.value;

	const followSelection = useCallback((root: HTMLDivElement | null) => {
		if (!root) return;

		let selectedId: string | undefined;

		const sync = () => {
			const selected = root.querySelector('[cmdk-item][aria-selected="true"]');
			const id = selected?.id;

			if (selected && id !== selectedId) {
				const list = root.querySelector("[cmdk-list]");

				if (list && list.querySelector("[cmdk-item]") === selected)
					list.scrollTop = 0;
			}

			selectedId = id;

			for (const element of root.querySelectorAll(
				"[cmdk-input], [cmdk-list]",
			)) {
				if (!id) element.removeAttribute("aria-activedescendant");
				else if (element.getAttribute("aria-activedescendant") !== id) {
					element.setAttribute("aria-activedescendant", id);
				}
			}
		};

		const observer = new MutationObserver(sync);

		observer.observe(root, {
			attributeFilter: ["aria-selected", "aria-activedescendant"],
			childList: true,
			subtree: true,
		});
		sync();

		return () => observer.disconnect();
	}, []);

	const selectFirstRecord = useCallback((node: HTMLDivElement | null) => {
		const root = node?.closest("[cmdk-root]");

		if (!root) return;

		requestAnimationFrame(() => {
			if (moved.current || !root.isConnected) return;

			selectingFirst.current = true;
			root.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
			);
			selectingFirst.current = false;
		});
	}, []);

	const searching = question !== "";
	const error = searching ? searchError : undefined;

	const status = error
		? error
		: searching && loading
			? loadingLabel
			: searching && count === 0
				? emptyLabel
				: "";

	const changeQuery = (next: string) => {
		setQuery(next);
		moved.current = false;
		onQueryChange?.(next);
	};

	const changeOpen = (next: boolean) => {
		onOpenChange(next);

		if (!next) changeQuery("");
	};

	const onShortcut = useEffectEvent((event: KeyboardEvent) => {
		if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			changeOpen(!open);
		}
	});

	useMountEffect(() => {
		const listener = (event: KeyboardEvent) => onShortcut(event);

		window.addEventListener("keydown", listener);

		return () => window.removeEventListener("keydown", listener);
	});

	return (
		<CommandDialog
			description={description}
			onOpenChange={changeOpen}
			open={open}
			title={title}
		>
			<Command
				data-slot="command-search"
				filter={filter}
				onKeyDown={(event) => {
					if (movesSelection(event) && !selectingFirst.current) {
						moved.current = true;
					}
				}}
				onPointerMove={(event) => {
					if (
						event.target instanceof Element &&
						event.target.closest("[cmdk-item]")
					)
						moved.current = true;
				}}
				ref={followSelection}
			>
				{workspaceName ? (
					<p className="px-2 pt-0.5 pb-1.5 text-muted-foreground text-xs">
						Search in {workspaceName}
					</p>
				) : null}
				<CommandInput
					onValueChange={changeQuery}
					placeholder={placeholder}
					value={query}
				/>
				<div
					className={cn(
						"flex items-center gap-3 text-muted-foreground",
						!status && "sr-only",
						count === 0 ? "justify-center py-6 text-sm" : "px-2 py-1.5 text-xs",
					)}
					data-slot="command-search-status"
				>
					<output>{status}</output>
					{error && onRetry ? (
						<Button
							onClick={onRetry}
							onKeyDown={keepKeys}
							size="xs"
							variant="outline"
						>
							{retryLabel}
						</Button>
					) : null}
				</div>
				<CommandList>
					{groups.map((group) => (
						<CommandGroup
							heading={group.heading}
							key={`${group.result ? "result" : "item"}:${group.heading}`}
						>
							{group.entries.map((entry) => (
								<Row
									entry={entry}
									first={
										entry.value === firstResult ? selectFirstRecord : undefined
									}
									key={entry.value}
									onSelect={() => {
										changeOpen(false);
										entry.item.onSelect();
									}}
									words={words}
								/>
							))}
						</CommandGroup>
					))}
				</CommandList>
				<div
					aria-hidden
					className="-mx-1.5 -mb-1.5 mt-1.5 flex items-center gap-4 border-t px-3 py-2.5 text-muted-foreground text-xs"
					data-slot="command-search-hints"
				>
					<span className="flex items-center gap-1.5">
						<KbdGroup>
							<Kbd size="sm">
								<ArrowUpIcon />
							</Kbd>
							<Kbd size="sm">
								<ArrowDownIcon />
							</Kbd>
						</KbdGroup>
						Select
					</span>
					<span className="flex items-center gap-1.5">
						<Kbd size="sm">
							<CornerDownLeftIcon />
						</Kbd>
						Open
					</span>
					<span className="ml-auto flex items-center gap-1.5">
						<Kbd size="sm">Esc</Kbd>
						Close
					</span>
				</div>
			</Command>
		</CommandDialog>
	);
}

export { CommandSearch };
