"use client";

import Add from "@carbon/icons-react/es/Add";
import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import OverflowMenuVertical from "@carbon/icons-react/es/OverflowMenuVertical";
import Renew from "@carbon/icons-react/es/Renew";
import Warning from "@carbon/icons-react/es/Warning";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { SortableItem, SortableList } from "@crm/ui/components/sortable-list";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import {
	ARCHIVED_NOTE,
	ARCHIVED_ROW,
	CUSTOM_GROUP,
	DRAG_NOTE,
	EMPTY_BODY,
	EMPTY_TITLE,
	ERROR_BODY,
	ERROR_TITLE,
	MANUAL_ONLY,
	NEW_FIELD,
	ORDER_NOTE,
	RETRY,
	STANDARD_NOTE,
	STANDARD_ROW,
	TABLE_NOTE,
} from "./fields-copy";
import { type FieldEntity, kindOf } from "./fields-entity";
import { STANDARD_FIELDS } from "./standard-fields";

type Field = RouterOutputs["fields"]["list"][number];

const ROW = "flex items-center gap-2.5 border-b px-5 py-2";

function summaryOf(field: Field): string {
	const parts: string[] = [];

	if (field.agentFilled) {
		parts.push(
			field.agentBrief ??
				(field.options.length > 0
					? `${field.options.length} options`
					: field.label),
		);
	} else {
		parts.push(MANUAL_ONLY);
		if (field.required) parts.push("required");
	}

	if (field.showOnTable) parts.push(TABLE_NOTE);

	return parts.join(" · ");
}

function reordered(fields: Field[], ids: string[]): Field[] {
	const live = fields.filter((field) => !field.archived);
	const byId = new Map(live.map((field) => [field.id, field]));
	const queue = ids
		.map((id) => byId.get(id))
		.filter((field): field is Field => field !== undefined);

	if (queue.length !== live.length) return fields;

	return fields.map((field) =>
		field.archived ? field : (queue.shift() ?? field),
	);
}

function DisclosureRow({
	title,
	note,
	children,
}: {
	title: string;
	note: string;
	children: React.ReactNode;
}) {
	return (
		<Collapsible>
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center gap-2 border-b px-5 py-2.5 text-left"
				>
					<Icon
						icon={ChevronRight}
						className="shrink-0 text-muted-foreground"
					/>
					<span className="flex-1 font-medium text-foreground text-xs">
						{title}
					</span>
					<span className="shrink-0 text-muted-foreground text-xs">{note}</span>
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent>{children}</CollapsibleContent>
		</Collapsible>
	);
}

export function FieldsList({
	entity,
	onEdit,
	onNew,
}: {
	entity: FieldEntity;
	onEdit: (key: string) => void;
	onNew: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const queryClient = useQueryClient();

	const listKey = trpc.fields.list.queryKey({ entity, includeArchived: true });

	const query = useQuery(
		trpc.fields.list.queryOptions({ entity, includeArchived: true }),
	);

	const reorder = useMutation(
		trpc.fields.reorder.mutationOptions({
			onMutate: async ({ ids }) => {
				await queryClient.cancelQueries({ queryKey: listKey });
				const previous = queryClient.getQueryData(listKey);
				if (previous) {
					queryClient.setQueryData(listKey, reordered(previous, ids));
				}
				return { previous };
			},
			onError: (error, _input, context) => {
				if (context?.previous) {
					queryClient.setQueryData(listKey, context.previous);
				}
				toast.error(error.message);
			},
			onSettled: () => cache.fields(kindOf(entity)),
		}),
	);

	const archive = useMutation(
		trpc.fields.archive.mutationOptions({
			onSuccess: () => cache.fields(kindOf(entity)),
			onError: (error) => toast.error(error.message),
		}),
	);

	const restore = useMutation(
		trpc.fields.restore.mutationOptions({
			onSuccess: () => cache.fields(kindOf(entity)),
			onError: (error) => toast.error(error.message),
		}),
	);

	const all = query.data ?? [];
	const live = all.filter((field) => !field.archived);
	const archived = all.filter((field) => field.archived);
	const standard = STANDARD_FIELDS[entity];

	return (
		<>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<DisclosureRow
					title={STANDARD_ROW}
					note={`${standard.length} · ${STANDARD_NOTE}`}
				>
					<ul className="border-b bg-muted/40 py-1">
						{standard.map((field) => (
							<li
								key={field}
								className="px-5 py-1 text-muted-foreground text-xs"
							>
								{field}
							</li>
						))}
					</ul>
				</DisclosureRow>

				{query.isPending ? (
					<div className="flex flex-1 items-center justify-center">
						<Spinner />
					</div>
				) : query.isError ? (
					<Empty className="flex-1">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Icon icon={Warning} />
							</EmptyMedia>
							<EmptyTitle>{ERROR_TITLE}</EmptyTitle>
							<EmptyDescription>{ERROR_BODY}</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button
								variant="outline"
								disabled={query.isFetching}
								onClick={() => query.refetch()}
							>
								<Icon icon={Renew} data-icon="inline-start" />
								{RETRY}
							</Button>
						</EmptyContent>
					</Empty>
				) : (
					<>
						{live.length === 0 ? (
							<Empty className="flex-1">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<Icon icon={Add} />
									</EmptyMedia>
									<EmptyTitle>{EMPTY_TITLE}</EmptyTitle>
									<EmptyDescription>{EMPTY_BODY}</EmptyDescription>
								</EmptyHeader>
								<EmptyContent>
									<Button onClick={onNew}>
										<Icon icon={Add} data-icon="inline-start" />
										{NEW_FIELD}
									</Button>
								</EmptyContent>
							</Empty>
						) : (
							<>
								<div className="flex items-center justify-between gap-3 px-5 pt-3.5 pb-2">
									<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
										{CUSTOM_GROUP}
									</span>
									<span className="text-muted-foreground text-xs">
										{DRAG_NOTE}
									</span>
								</div>

								<SortableList
									ids={live.map((field) => field.id)}
									onReorder={(ids) => reorder.mutate({ entity, ids })}
								>
									{live.map((field) => (
										<SortableItem
											key={field.id}
											id={field.id}
											label={field.label}
											className={ROW}
										>
											<button
												type="button"
												onClick={() => onEdit(field.key)}
												className="flex min-w-0 flex-1 flex-col gap-px text-left"
											>
												<span className="w-full truncate font-medium text-foreground text-xs">
													{field.label}
												</span>
												<span className="w-full truncate text-muted-foreground text-xs">
													{summaryOf(field)}
												</span>
											</button>

											<Badge
												variant="mono"
												className="w-18 shrink-0 justify-center"
											>
												{field.typeLabel}
											</Badge>

											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="ghost" size="icon-xs">
														<Icon icon={OverflowMenuVertical} />
														<span className="sr-only">
															More for {field.label}
														</span>
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem onSelect={() => onEdit(field.key)}>
														Edit
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														onSelect={() => archive.mutate({ id: field.id })}
													>
														Archive
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</SortableItem>
									))}
								</SortableList>
							</>
						)}

						{archived.length > 0 ? (
							<DisclosureRow
								title={ARCHIVED_ROW}
								note={`${archived.length} · ${ARCHIVED_NOTE}`}
							>
								<ul className="border-b">
									{archived.map((field) => (
										<li
											key={field.id}
											className="flex items-center gap-2.5 px-5 py-2"
										>
											<span className="flex-1 truncate text-muted-foreground text-xs">
												{field.label}
											</span>
											<Button
												variant="outline"
												size="xs"
												onClick={() => restore.mutate({ id: field.id })}
											>
												Restore
											</Button>
										</li>
									))}
								</ul>
							</DisclosureRow>
						) : null}
					</>
				)}
			</div>

			{live.length > 0 ? (
				<div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3">
					<Button onClick={onNew}>
						<Icon icon={Add} data-icon="inline-start" />
						{NEW_FIELD}
					</Button>
					<span className="text-right text-muted-foreground text-xs">
						{ORDER_NOTE}
					</span>
				</div>
			) : null}
		</>
	);
}
