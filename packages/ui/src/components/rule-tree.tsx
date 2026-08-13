"use client";

import Add from "@carbon/icons-react/es/Add";
import Close from "@carbon/icons-react/es/Close";
import type { ReactNode } from "react";
import { Button } from "./button";
import { Icon } from "./icon";
import { Input } from "./input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./select";
import { cn } from "../lib/utils";

export type FacetField =
	| { kind: "none" }
	| { kind: "text"; key: string; placeholder?: string }
	| { kind: "number"; key: string; suffix?: string }
	| { kind: "choice"; key: string; options: { value: string; label: string }[] }
	| { kind: "list"; key: string; placeholder?: string; separator: string }
	| {
			kind: "pair";
			key: string;
			extraKey: string;
			options: { value: string; label: string }[];
			placeholder?: string;
	  };

export type FacetSpec = {
	id: string;
	group: string;
	label: string;
	field: FacetField;
};

export type RuleRow = {
	id: string;
	facet: string;
	value: string;
	extra?: string;
	negate?: boolean;
};

export type RuleTreeValue = {
	match: "all" | "any";
	rules: RuleRow[];
};

function fieldFor(spec: FacetSpec | undefined): FacetField {
	return spec?.field ?? { kind: "none" };
}

export function RuleTree({
	value,
	facets,
	counts,
	onChange,
	footer,
}: {
	value: RuleTreeValue;
	facets: FacetSpec[];
	counts?: Record<string, number | undefined>;
	onChange: (next: RuleTreeValue) => void;
	footer?: ReactNode;
}) {
	const groups = [...new Set(facets.map((facet) => facet.group))];

	const set = (id: string, patch: Partial<RuleRow>) =>
		onChange({
			...value,
			rules: value.rules.map((rule) =>
				rule.id === id ? { ...rule, ...patch } : rule,
			),
		});

	const remove = (id: string) =>
		onChange({ ...value, rules: value.rules.filter((rule) => rule.id !== id) });

	const add = () =>
		onChange({
			...value,
			rules: [
				...value.rules,
				{
					id: `rule-${value.rules.length}-${facets[0]?.id ?? "x"}`,
					facet: facets[0]?.id ?? "",
					value: "",
				},
			],
		});

	return (
		<div className="flex flex-col rounded-lg border">
			{value.rules.length === 0 ? (
				<p className="px-4 py-6 text-center text-muted-foreground text-xs">
					No rules yet. Everybody is out until you add one.
				</p>
			) : null}

			{value.rules.map((rule, index) => {
				const spec = facets.find((facet) => facet.id === rule.facet);
				const field = fieldFor(spec);

				return (
					<div
						key={rule.id}
						className={cn(
							"flex flex-wrap items-center gap-2 px-4 py-3",
							index > 0 && "border-t",
						)}
					>
						<span className="w-12 shrink-0 text-muted-foreground text-xs">
							{index === 0 ? "Where" : value.match === "all" ? "and" : "or"}
						</span>

						<Select
							value={rule.negate ? "not" : "is"}
							onValueChange={(next) =>
								set(rule.id, { negate: next === "not" })
							}
						>
							<SelectTrigger className="w-[76px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="is">is</SelectItem>
								<SelectItem value="not">is not</SelectItem>
							</SelectContent>
						</Select>

						<Select
							value={rule.facet}
							onValueChange={(next) =>
								set(rule.id, { facet: next, value: "", extra: undefined })
							}
						>
							<SelectTrigger className="w-[240px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{groups.map((group) => (
									<div key={group}>
										<p className="px-2 py-1.5 text-muted-foreground text-xs">
											{group}
										</p>
										{facets
											.filter((facet) => facet.group === group)
											.map((facet) => (
												<SelectItem key={facet.id} value={facet.id}>
													{facet.label}
												</SelectItem>
											))}
									</div>
								))}
							</SelectContent>
						</Select>

						{field.kind === "text" ? (
							<Input
								className="w-[200px]"
								value={rule.value}
								placeholder={field.placeholder}
								onChange={(event) => set(rule.id, { value: event.target.value })}
							/>
						) : null}

						{field.kind === "number" ? (
							<span className="flex items-center gap-2">
								<Input
									className="w-[90px]"
									type="number"
									value={rule.value}
									onChange={(event) =>
										set(rule.id, { value: event.target.value })
									}
								/>
								{field.suffix ? (
									<span className="text-muted-foreground text-xs">
										{field.suffix}
									</span>
								) : null}
							</span>
						) : null}

						{field.kind === "choice" ? (
							<Select
								value={rule.value}
								onValueChange={(next) => set(rule.id, { value: next })}
							>
								<SelectTrigger className="w-[200px]">
									<SelectValue placeholder="Choose" />
								</SelectTrigger>
								<SelectContent>
									{field.options.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : null}

						{field.kind === "list" ? (
							<Input
								className="w-[320px]"
								value={rule.value}
								placeholder={field.placeholder}
								onChange={(event) => set(rule.id, { value: event.target.value })}
							/>
						) : null}

						{field.kind === "pair" ? (
							<span className="flex items-center gap-2">
								<Select
									value={rule.value}
									onValueChange={(next) => set(rule.id, { value: next })}
								>
									<SelectTrigger className="w-[180px]">
										<SelectValue placeholder="Choose a field" />
									</SelectTrigger>
									<SelectContent>
										{field.options.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<span className="text-muted-foreground text-xs">is</span>
								<Input
									className="w-[160px]"
									value={rule.extra ?? ""}
									placeholder={field.placeholder}
									onChange={(event) =>
										set(rule.id, { extra: event.target.value })
									}
								/>
							</span>
						) : null}

						<span className="flex-1" />

						{counts?.[rule.id] === undefined ? null : (
							<span className="text-muted-foreground text-xs tabular-nums">
								{counts[rule.id]?.toLocaleString()}
							</span>
						)}

						<Button
							variant="ghost"
							size="icon"
							aria-label="Remove this rule"
							onClick={() => remove(rule.id)}
						>
							<Icon icon={Close} />
						</Button>
					</div>
				);
			})}

			<div className="flex items-center gap-2 border-t bg-muted px-4 py-3">
				<Button size="sm" onClick={add}>
					<Icon icon={Add} data-icon="inline-start" />
					Rule
				</Button>

				<span className="flex-1" />

				{footer}

				<div className="flex items-center gap-0.5 rounded-md bg-border p-0.5">
					{(["all", "any"] as const).map((mode) => (
						<Button
							key={mode}
							variant={value.match === mode ? "outline" : "ghost"}
							size="sm"
							className="h-7 px-3 font-normal text-xs"
							onClick={() => onChange({ ...value, match: mode })}
						>
							Match {mode}
						</Button>
					))}
				</div>
			</div>
		</div>
	);
}
