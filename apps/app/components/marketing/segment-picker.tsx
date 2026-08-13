"use client";

import Close from "@carbon/icons-react/es/Close";
import { Button } from "@crm/ui/components/button";
import { Combobox } from "@crm/ui/components/combobox";
import { Icon } from "@crm/ui/components/icon";
import { Label } from "@crm/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc/client";

export type SegmentChoice = {
	id: string;
	name: string;
	mode: "INCLUDE" | "EXCLUDE";
};

function Row({
	name,
	held,
	onRemove,
}: {
	name: string;
	held: boolean;
	onRemove: () => void;
}) {
	return (
		<div className="flex items-center gap-2 border-t px-3 py-2 text-xs first:border-t-0">
			<span className="min-w-0 flex-1 truncate">{name}</span>
			{held ? <span className="text-muted-foreground">Excluded</span> : null}
			<Button
				variant="ghost"
				size="icon"
				aria-label="Remove"
				onClick={onRemove}
			>
				<Icon icon={Close} className="size-3.5" />
			</Button>
		</div>
	);
}

export function SegmentPicker({
	value,
	onChange,
	disabled,
}: {
	value: SegmentChoice[];
	onChange: (next: SegmentChoice[]) => void;
	disabled?: boolean;
}) {
	const trpc = useTRPC();
	const [search, setSearch] = useState("");

	const segments = useQuery(trpc.marketingSegments.options.queryOptions());

	const chosen = new Set(value.map((one) => one.id));
	const all = segments.data ?? [];

	const add = (id: string, mode: "INCLUDE" | "EXCLUDE") => {
		const segment = all.find((one) => one.id === id);
		if (!segment) return;

		setSearch("");
		onChange([
			...value.filter((one) => one.id !== id),
			{ id, name: segment.name, mode },
		]);
	};

	const remove = (id: string) => onChange(value.filter((one) => one.id !== id));

	const query = search.trim().toLowerCase();
	const options = all
		.filter((segment) => !chosen.has(segment.id))
		.filter(
			(segment) => query === "" || segment.name.toLowerCase().includes(query),
		)
		.map((segment) => ({ value: segment.id, label: segment.name }));

	const included = value.filter((one) => one.mode === "INCLUDE");
	const excluded = value.filter((one) => one.mode === "EXCLUDE");

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<Label className="text-muted-foreground text-xs">Send to</Label>

				<div className="overflow-clip rounded-md border">
					{included.length === 0 ? (
						<p className="px-3 py-2.5 text-muted-foreground text-xs">
							Nobody yet. Add a segment and everybody in it receives this.
						</p>
					) : (
						included.map((one) => (
							<Row
								key={one.id}
								name={one.name}
								held={false}
								onRemove={() => remove(one.id)}
							/>
						))
					)}
				</div>

				<Combobox
					options={options}
					value=""
					onValueChange={(id) => add(id, "INCLUDE")}
					search={search}
					onSearchChange={setSearch}
					placeholder="Add a segment"
					searchPlaceholder="Search segments…"
					empty="Nothing left to add."
					disabled={disabled}
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label className="text-muted-foreground text-xs">Never send to</Label>

				<div className="overflow-clip rounded-md border">
					{excluded.length === 0 ? (
						<p className="px-3 py-2.5 text-muted-foreground text-xs">
							Nobody is excluded. An exclusion beats every include.
						</p>
					) : (
						excluded.map((one) => (
							<Row
								key={one.id}
								name={one.name}
								held
								onRemove={() => remove(one.id)}
							/>
						))
					)}
				</div>

				<Combobox
					options={options}
					value=""
					onValueChange={(id) => add(id, "EXCLUDE")}
					search={search}
					onSearchChange={setSearch}
					placeholder="Exclude a segment"
					searchPlaceholder="Search segments…"
					empty="Nothing left to add."
					disabled={disabled}
				/>
			</div>
		</div>
	);
}

export function splitSegments(value: SegmentChoice[]): {
	segmentIds: string[];
	excludeSegmentIds: string[];
} {
	return {
		segmentIds: value
			.filter((one) => one.mode === "INCLUDE")
			.map((one) => one.id),
		excludeSegmentIds: value
			.filter((one) => one.mode === "EXCLUDE")
			.map((one) => one.id),
	};
}
