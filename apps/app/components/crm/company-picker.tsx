"use client";

import { Combobox, type ComboboxOption } from "@crm/ui/components/combobox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@crm/ui/components/command";
import { Spinner } from "@crm/ui/components/spinner";
import { useSearchInput } from "@crm/ui/hooks/use-search-input";
import { cn } from "@crm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { type Ref, useId, useState } from "react";
import { PROPERTY_LABEL, PROPERTY_ROW } from "@/components/detail-sheet";
import { useTRPC } from "@/lib/trpc/client";

export function CompanyPicker({
	id,
	value,
	onValueChange,
	placeholder = "Choose a company",
	none,
	selected,
	disabled,
	variant,
	className,
}: {
	id?: string;
	value: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	none?: { value: string; label: string };
	selected?: ComboboxOption;
	disabled?: boolean;
	variant?: "default" | "ghost";
	className?: string;
}) {
	const trpc = useTRPC();

	const [query, setQuery] = useState("");
	const [text, setText] = useSearchInput(query, setQuery);
	const [chosen, setChosen] = useState<ComboboxOption | null>(null);

	const companies = useQuery({
		...trpc.companies.options.queryOptions({ q: query }),
		placeholderData: (previous) => previous,
	});

	const matches: ComboboxOption[] = (companies.data ?? []).map((company) => ({
		value: company.id,
		label: company.name,
		hint: company.domain ?? undefined,
		keywords: company.domain ? [company.domain] : undefined,
	}));

	const cleared = none ? [{ value: none.value, label: none.label }] : [];
	const options = query.trim() ? matches : [...cleared, ...matches];
	const stale = companies.isFetching || text.trim() !== query.trim();

	const current =
		chosen?.value === value
			? chosen
			: ([...cleared, ...matches].find((option) => option.value === value) ??
				(selected?.value === value ? selected : undefined));

	return (
		<Combobox
			id={id}
			value={value}
			onValueChange={(next) => {
				setChosen(options.find((option) => option.value === next) ?? null);
				onValueChange(next);
			}}
			options={options}
			selectedOption={current}
			disabled={disabled}
			placeholder={placeholder}
			searchPlaceholder="Search companies…"
			empty={companies.isFetching ? "Searching…" : "No company matches."}
			search={text}
			onSearchChange={setText}
			stale={stale}
			variant={variant}
			className={className}
		/>
	);
}

export function CompanyMenuSearch({
	none,
	onSelect,
	inputRef,
}: {
	none?: string;
	onSelect: (companyId: string | null) => void;
	inputRef?: Ref<HTMLInputElement>;
}) {
	const trpc = useTRPC();

	const [query, setQuery] = useState("");
	const [text, setText] = useSearchInput(query, setQuery);

	const companies = useQuery({
		...trpc.companies.options.queryOptions({ q: query }),
		placeholderData: (previous) => previous,
	});

	const stale = companies.isFetching || text.trim() !== query.trim();

	return (
		<Command
			shouldFilter={false}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<CommandInput
				ref={inputRef}
				placeholder="Search companies…"
				value={text}
				onValueChange={setText}
				autoFocus
			/>
			<CommandList>
				<CommandEmpty>
					{companies.isFetching ? "Searching…" : "No company matches."}
				</CommandEmpty>
				<CommandGroup>
					{none && !query.trim() ? (
						<CommandItem
							value="none"
							disabled={stale}
							onSelect={() => onSelect(null)}
						>
							{none}
						</CommandItem>
					) : null}
					{(companies.data ?? []).map((company) => (
						<CommandItem
							key={company.id}
							value={company.id}
							disabled={stale}
							onSelect={() => onSelect(company.id)}
						>
							<span className="truncate">{company.name}</span>
							{company.domain ? (
								<span className="ml-auto truncate text-muted-foreground text-xs">
									{company.domain}
								</span>
							) : null}
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</Command>
	);
}

export function InlineCompanyField({
	label = "Company",
	value,
	onSave,
	saving = false,
	none,
	company,
}: {
	label?: string;
	value: string;
	onSave: (next: string) => void;
	saving?: boolean;
	none?: { value: string; label: string };
	company?: { id: string; name: string } | null;
}) {
	const id = useId();

	return (
		<div className={cn(PROPERTY_ROW, "items-center")}>
			<label htmlFor={id} className={PROPERTY_LABEL}>
				{label}
			</label>
			<div className="flex min-w-0 items-center gap-1.5">
				<CompanyPicker
					id={id}
					value={value}
					onValueChange={onSave}
					none={none}
					selected={
						company ? { value: company.id, label: company.name } : undefined
					}
					disabled={saving}
					variant="ghost"
					className="w-full"
				/>
				{saving ? <Spinner /> : null}
			</div>
		</div>
	);
}
