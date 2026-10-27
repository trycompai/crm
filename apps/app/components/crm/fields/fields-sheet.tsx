"use client";

import { SkeletonField, SkeletonLine } from "@crm/ui/components/skeleton-lines";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { SKELETON, skeletonRows } from "@crm/ui/lib/skeleton-config";
import { useQuery } from "@tanstack/react-query";
import {
	type RecordKind,
	useFieldsSheet,
} from "@/components/crm/record-sheet/record-stack";
import { DetailSheet, DetailSheetHeader } from "@/components/detail-sheet";
import { useTRPC } from "@/lib/trpc/client";
import { FieldEditor } from "./field-editor";
import {
	ENTITY_TABS,
	NEW_FIELD,
	SHEET_TITLE,
	subtitleFor,
} from "./fields-copy";
import { entityOf } from "./fields-entity";
import { FieldsList } from "./fields-list";

function FieldsSheetBody({
	kind,
	field,
	onEntity,
	onEdit,
	onClose,
}: {
	kind: RecordKind;
	field: string | null;
	onEntity: (kind: RecordKind) => void;
	onEdit: (key: string | null) => void;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const entity = entityOf(kind);

	const query = useQuery(
		trpc.fields.list.queryOptions({ entity, includeArchived: true }),
	);

	const editingKey = field && field !== "new" ? field : null;
	const editing = editingKey
		? query.data?.find((entry) => entry.key === editingKey)
		: undefined;

	const coverage = useQuery({
		...trpc.fields.coverage.queryOptions({ id: editing?.id ?? "" }),
		enabled: Boolean(editing?.agentFilled),
	});

	if (field) {
		const entityLabel = ENTITY_TABS.find((tab) => tab.kind === kind)?.label;
		const filled = coverage.data;

		return (
			<>
				<DetailSheetHeader
					title={editing?.label ?? (editingKey ? "" : NEW_FIELD)}
					description={
						filled ? (
							<span className="flex flex-wrap gap-x-3">
								<span>{entityLabel}</span>
								<span>
									{filled.filled} of {filled.total} filled
								</span>
							</span>
						) : (
							entityLabel
						)
					}
					onBack={() => onEdit(null)}
					onClose={onClose}
				/>
				{editingKey && query.isPending ? (
					<div
						aria-busy
						className="flex min-h-0 flex-1 flex-col gap-6 px-5 py-4"
					>
						{skeletonRows(SKELETON.rows.editor).map((row) => (
							<div key={row} className="flex flex-col gap-2">
								<SkeletonLine width="24" />
								<SkeletonField />
							</div>
						))}
					</div>
				) : (
					<FieldEditor
						key={editing?.id ?? "new"}
						entity={entity}
						field={editing}
						onDone={() => onEdit(null)}
					/>
				)}
			</>
		);
	}

	return (
		<>
			<DetailSheetHeader
				title={SHEET_TITLE}
				description={subtitleFor(kind)}
				onClose={onClose}
				note={
					<Tabs
						value={kind}
						onValueChange={(next) => onEntity(next as RecordKind)}
					>
						<TabsList>
							{ENTITY_TABS.map((tab) => (
								<TabsTrigger key={tab.kind} value={tab.kind}>
									{tab.label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				}
			/>
			<FieldsList
				entity={entity}
				onEdit={(key) => onEdit(key)}
				onNew={() => onEdit("new")}
			/>
		</>
	);
}

export function FieldsSheetHost() {
	const { entity, field, open, close, edit } = useFieldsSheet();

	return (
		<DetailSheet
			open={entity !== null}
			size="md"
			onOpenChange={(next) => {
				if (!next) close();
			}}
		>
			{entity ? (
				<FieldsSheetBody
					kind={entity}
					field={field}
					onEntity={open}
					onEdit={edit}
					onClose={close}
				/>
			) : null}
		</DetailSheet>
	);
}
