"use client";

import Add from "@carbon/icons-react/es/Add";
import Close from "@carbon/icons-react/es/Close";
import {
	FIELD_TYPES,
	fieldKeyFromLabel,
	typeLabel,
} from "@crm/db/fields-shape";
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
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Field,
	FieldDescription,
	FieldLabel,
	FieldTitle,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SortableItem, SortableList } from "@crm/ui/components/sortable-list";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import {
	ADD_FIELD,
	ADD_OPTION,
	AGENT_HELP,
	AGENT_LABEL,
	ALL_FILLED,
	ARCHIVE,
	BRIEF_HELP,
	BRIEF_LABEL,
	CANCEL,
	FILL_REST,
	KEY_HELP,
	KEY_LABEL,
	LABEL_LABEL,
	OPTIONS_LABEL,
	optionLabel,
	SAVE,
	sheetPlacement,
	TYPE_LABEL,
	tablePlacement,
} from "./fields-copy";
import { type FieldEntity, kindOf } from "./fields-entity";

const COVERAGE_NOUN: Record<FieldEntity, string> = {
	COMPANY: "companies",
	CONTACT: "contacts",
	DEAL: "deals",
};

type FieldRecord = RouterOutputs["fields"]["list"][number];

type Draft = {
	label: string;
	type: (typeof FIELD_TYPES)[number];
	options: { id?: string; label: string }[];
	agentFilled: boolean;
	agentBrief: string;
	showOnSheet: boolean;
	showOnTable: boolean;
};

const TYPE_HINTS: Record<string, string> = {
	TEXT: "Text — a short line",
	LONG_TEXT: "Long text — a paragraph",
	NUMBER: "Number",
	DATE: "Date",
	CHECKBOX: "Checkbox — yes or no",
	SELECT: "Select — one of a fixed list",
	URL: "URL",
	EMAIL: "Email",
	PHONE: "Phone",
	USER: "User — someone in the workspace",
};

function optionId(option: { id?: string }, index: number): string {
	return option.id ?? `draft-${index}`;
}

const SECTION = "flex flex-col gap-4 border-b px-5 py-4";

function draftFrom(field: FieldRecord | undefined): Draft {
	return {
		label: field?.label ?? "",
		type: field?.type ?? "TEXT",
		options:
			field?.options.map((option) => ({
				id: option.id,
				label: option.label,
			})) ?? [],
		agentFilled: field?.agentFilled ?? true,
		agentBrief: field?.agentBrief ?? "",
		showOnSheet: field?.showOnSheet ?? true,
		showOnTable: field?.showOnTable ?? false,
	};
}

function Coverage({ field }: { field: FieldRecord }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const coverage = useQuery(
		trpc.fields.coverage.queryOptions({ id: field.id }),
	);

	const backfill = useMutation(
		trpc.fields.backfill.mutationOptions({
			onSuccess: async () => {
				toast.success("Your agents will pick this up.");
				await cache.fieldCoverage(field.id);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!field.agentFilled || !coverage.data) return null;

	const { filled, total } = coverage.data;
	const noun = COVERAGE_NOUN[field.entity as FieldEntity];
	const covered = filled >= total;

	return (
		<div className="shrink-0 border-t px-5 py-3">
			<div className="flex items-center gap-3 rounded-md bg-muted p-3">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<StatusIndicator
						tone="primary"
						className="font-medium text-foreground"
						label={`Filled on ${filled} of ${total} ${noun}`}
					/>
					<span className="pl-4 text-muted-foreground text-xs">
						{covered ? ALL_FILLED : `${total - filled} still to go`}
					</span>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={backfill.isPending || covered}
					onClick={() => backfill.mutate({ id: field.id })}
				>
					{FILL_REST}
				</Button>
			</div>
		</div>
	);
}

export function FieldEditor({
	entity,
	field,
	onDone,
}: {
	entity: FieldEntity;
	field: FieldRecord | undefined;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const labelId = useId();
	const briefId = useId();
	const agentId = useId();
	const typeId = useId();
	const optionsId = useId();

	const [draft, setDraft] = useState<Draft>(() => draftFrom(field));
	const [confirming, setConfirming] = useState(false);

	const patch = (next: Partial<Draft>) =>
		setDraft((current) => ({ ...current, ...next }));

	const settle = async () => {
		await cache.fields(kindOf(entity));
		onDone();
	};

	const create = useMutation(
		trpc.fields.create.mutationOptions({
			onSuccess: settle,
			onError: (error) => toast.error(error.message),
		}),
	);

	const update = useMutation(
		trpc.fields.update.mutationOptions({
			onSuccess: settle,
			onError: (error) => toast.error(error.message),
		}),
	);

	const archive = useMutation(
		trpc.fields.archive.mutationOptions({
			onSuccess: settle,
			onError: (error) => toast.error(error.message),
		}),
	);

	const key = field?.key ?? fieldKeyFromLabel(draft.label);
	const saving = create.isPending || update.isPending;

	const save = () => {
		const payload = {
			label: draft.label,
			type: draft.type,
			options: draft.options.filter((option) => option.label.trim() !== ""),
			agentFilled: draft.agentFilled,
			agentBrief: draft.agentBrief.trim() || null,
			showOnSheet: draft.showOnSheet,
			showOnTable: draft.showOnTable,
		};

		if (field) {
			update.mutate({ id: field.id, data: payload });
			return;
		}

		create.mutate({ ...payload, entity, required: false });
	};

	return (
		<>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<div className={SECTION}>
					<Field>
						<FieldLabel htmlFor={labelId}>{LABEL_LABEL}</FieldLabel>
						<Input
							id={labelId}
							value={draft.label}
							onChange={(event) => patch({ label: event.target.value })}
						/>
					</Field>

					<Field>
						<div className="flex items-baseline justify-between gap-2">
							<FieldTitle>{KEY_LABEL}</FieldTitle>
							<span className="font-mono text-muted-foreground text-xs">
								{key || "—"}
							</span>
						</div>
						<FieldDescription>{KEY_HELP}</FieldDescription>
					</Field>
				</div>

				<div className={SECTION}>
					<Field orientation="horizontal">
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<FieldLabel htmlFor={agentId}>{AGENT_LABEL}</FieldLabel>
							<FieldDescription>{AGENT_HELP}</FieldDescription>
						</div>
						<Switch
							id={agentId}
							checked={draft.agentFilled}
							onCheckedChange={(agentFilled) => patch({ agentFilled })}
						/>
					</Field>

					<Field>
						<FieldLabel htmlFor={briefId}>{BRIEF_LABEL}</FieldLabel>
						<Textarea
							id={briefId}
							rows={3}
							value={draft.agentBrief}
							onChange={(event) => patch({ agentBrief: event.target.value })}
						/>
						<FieldDescription>{BRIEF_HELP}</FieldDescription>
					</Field>
				</div>

				<div className={SECTION}>
					<Field>
						<FieldLabel htmlFor={typeId}>{TYPE_LABEL}</FieldLabel>
						<Select
							value={draft.type}
							onValueChange={(value) => patch({ type: value as Draft["type"] })}
						>
							<SelectTrigger id={typeId} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{FIELD_TYPES.map((type) => (
									<SelectItem key={type} value={type}>
										{TYPE_HINTS[type] ?? typeLabel(type)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					{draft.type === "SELECT" ? (
						<Field aria-labelledby={optionsId}>
							<FieldTitle id={optionsId}>{OPTIONS_LABEL}</FieldTitle>
							<SortableList
								ids={draft.options.map(optionId)}
								onReorder={(ids) =>
									patch({
										options: ids
											.map((id) =>
												draft.options.find(
													(option, at) => optionId(option, at) === id,
												),
											)
											.filter((option): option is Draft["options"][number] =>
												Boolean(option),
											),
									})
								}
							>
								<div className="flex flex-col gap-1.5">
									{draft.options.map((option, index) => (
										<SortableItem
											key={optionId(option, index)}
											id={optionId(option, index)}
											label={option.label || "option"}
										>
											<Input
												aria-label={optionLabel(index)}
												value={option.label}
												onChange={(event) =>
													patch({
														options: draft.options.map((entry, at) =>
															at === index
																? { ...entry, label: event.target.value }
																: entry,
														),
													})
												}
											/>
											<Button
												variant="ghost"
												size="icon-xs"
												onClick={() =>
													patch({
														options: draft.options.filter(
															(_, at) => at !== index,
														),
													})
												}
											>
												<Icon icon={Close} />
												<span className="sr-only">
													Remove {optionLabel(index)}
												</span>
											</Button>
										</SortableItem>
									))}
								</div>
							</SortableList>
							<Button
								variant="ghost"
								size="sm"
								className="self-start"
								onClick={() =>
									patch({ options: [...draft.options, { label: "" }] })
								}
							>
								<Icon icon={Add} data-icon="inline-start" />
								{ADD_OPTION}
							</Button>
						</Field>
					) : null}
				</div>

				<div className="flex flex-col gap-2.5 border-b px-5 py-4">
					<FieldLabel className="items-center gap-2 font-normal">
						<Checkbox
							checked={draft.showOnSheet}
							onCheckedChange={(checked) =>
								patch({ showOnSheet: checked === true })
							}
						/>
						{sheetPlacement(entity)}
					</FieldLabel>
					<FieldLabel className="items-center gap-2 font-normal">
						<Checkbox
							checked={draft.showOnTable}
							onCheckedChange={(checked) =>
								patch({ showOnTable: checked === true })
							}
						/>
						{tablePlacement(entity)}
					</FieldLabel>
				</div>
			</div>

			{field ? <Coverage field={field} /> : null}

			<div className="flex shrink-0 items-center gap-2 border-t px-5 py-3">
				<Button disabled={saving || draft.label.trim() === ""} onClick={save}>
					{field ? SAVE : ADD_FIELD}
				</Button>
				{field ? (
					<Button variant="outline" onClick={() => setConfirming(true)}>
						{ARCHIVE}
					</Button>
				) : (
					<Button variant="outline" onClick={onDone}>
						{CANCEL}
					</Button>
				)}
			</div>

			{field ? (
				<AlertDialog open={confirming} onOpenChange={setConfirming}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Archive {field.label}?</AlertDialogTitle>
							<AlertDialogDescription>
								Hidden everywhere. Its values are kept.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{CANCEL}</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								onClick={() => archive.mutate({ id: field.id })}
							>
								Archive field
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			) : null}
		</>
	);
}
