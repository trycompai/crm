"use client";

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@crm/ui/components/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { selectTriggerVariants } from "@crm/ui/components/select";
import { cn } from "@crm/ui/lib/utils";
import type { VariantProps } from "class-variance-authority";
import { ChevronDownIcon } from "lucide-react";
import type * as React from "react";
import { useState } from "react";

type ComboboxOption = {
	value: string;
	label: string;
	hint?: string;
	keywords?: string[];
};

function Combobox({
	options,
	selectedOption,
	value,
	onValueChange,
	placeholder = "Select an option",
	searchPlaceholder = "Search…",
	empty = "Nothing matches.",
	search,
	onSearchChange,
	stale,
	size = "default",
	variant,
	className,
	...props
}: Omit<React.ComponentProps<"button">, "onChange" | "value"> &
	VariantProps<typeof selectTriggerVariants> & {
		options: ComboboxOption[];
		selectedOption?: ComboboxOption;
		value: string;
		onValueChange: (value: string) => void;
		placeholder?: string;
		searchPlaceholder?: string;
		empty?: React.ReactNode;
		search?: string;
		onSearchChange?: (search: string) => void;
		stale?: boolean;
		size?: "sm" | "default";
	}) {
	const [open, setOpen] = useState(false);
	const selected =
		selectedOption?.value === value
			? selectedOption
			: options.find((option) => option.value === value);

	const close = () => {
		setOpen(false);
		onSearchChange?.("");
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => (next ? setOpen(true) : close())}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					role="combobox"
					aria-expanded={open}
					data-slot="combobox-trigger"
					data-size={size}
					data-placeholder={selected ? undefined : ""}
					className={cn(selectTriggerVariants({ variant }), className)}
					{...props}
				>
					<span data-slot="select-value">{selected?.label ?? placeholder}</span>
					<ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
				</button>
			</PopoverTrigger>

			<PopoverContent
				align="start"
				size="fit"
				className="w-(--radix-popover-trigger-width) min-w-64"
			>
				<Command shouldFilter={onSearchChange === undefined}>
					<CommandInput
						placeholder={searchPlaceholder}
						value={search}
						onValueChange={onSearchChange}
					/>
					<CommandList>
						<CommandEmpty>{empty}</CommandEmpty>
						<CommandGroup>
							{options.map((option) => (
								<CommandItem
									key={option.value}
									value={option.label}
									keywords={option.keywords}
									disabled={stale}
									data-checked={option.value === value}
									onSelect={() => {
										close();
										onValueChange(option.value);
									}}
								>
									<span className="truncate">{option.label}</span>
									{option.hint ? (
										<span className="ml-auto truncate text-muted-foreground text-xs">
											{option.hint}
										</span>
									) : null}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

export { Combobox, type ComboboxOption };
