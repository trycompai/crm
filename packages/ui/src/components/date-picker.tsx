"use client";

import { Button } from "@crm/ui/components/button";
import { Calendar } from "@crm/ui/components/calendar";
import { Icon } from "@crm/ui/components/icon";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { selectTriggerVariants } from "@crm/ui/components/select";
import { formatDay, fromDay, toDay } from "@crm/ui/lib/format";
import { cn } from "@crm/ui/lib/utils";
import type { VariantProps } from "class-variance-authority";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";

export function DatePicker({
	id,
	value,
	onChange,
	placeholder = "Select a date",
	variant,
}: {
	id?: string;
	value: string | null | undefined;
	onChange: (next: string) => void;
	placeholder?: string;
} & VariantProps<typeof selectTriggerVariants>) {
	const [open, setOpen] = useState(false);
	const selected = fromDay(value);
	const thisYear = new Date().getFullYear();

	const choose = (next: string) => {
		setOpen(false);
		if (next !== (value ?? "")) onChange(next);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					id={id}
					data-slot="date-picker-trigger"
					data-size="default"
					data-placeholder={selected ? undefined : ""}
					className={cn(selectTriggerVariants({ variant }), "w-full")}
				>
					<span className="line-clamp-1">
						{selected ? formatDay(value) : placeholder}
					</span>
					<Icon
						icon={CalendarIcon}
						className="size-4 text-muted-foreground transition-opacity"
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent size="fit" align="start">
				<Calendar
					mode="single"
					selected={selected}
					startMonth={new Date(thisYear - 10, 0)}
					endMonth={new Date(thisYear + 10, 11)}
					defaultMonth={selected}
					onSelect={(next) => choose(next ? toDay(next) : "")}
					captionLayout="dropdown"
					autoFocus
				/>
				{selected ? (
					<div className="border-t p-1">
						<Button
							variant="ghost"
							size="sm"
							className="w-full justify-start"
							onClick={() => choose("")}
						>
							Clear
						</Button>
					</div>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
