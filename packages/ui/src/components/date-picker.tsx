"use client";

import CalendarGlyph from "@carbon/icons-react/es/Calendar";
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
import { type ComponentProps, useState } from "react";

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
						icon={CalendarGlyph}
						className="size-4 text-muted-foreground transition-opacity"
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent size="fit" align="start">
				<DatePickerCalendar
					value={value}
					onChange={choose}
					startMonth={new Date(thisYear - 10, 0)}
					endMonth={new Date(thisYear + 10, 11)}
					captionLayout="dropdown"
				/>
			</PopoverContent>
		</Popover>
	);
}

export function DatePickerCalendar({
	value,
	onChange,
	captionLayout,
	startMonth,
	endMonth,
}: {
	value: string | null | undefined;
	onChange: (next: string) => void;
} & Pick<
	ComponentProps<typeof Calendar>,
	"captionLayout" | "startMonth" | "endMonth"
>) {
	const selected = fromDay(value);

	return (
		<>
			<Calendar
				mode="single"
				selected={selected}
				defaultMonth={selected}
				startMonth={startMonth}
				endMonth={endMonth}
				captionLayout={captionLayout}
				onSelect={(next) => onChange(next ? toDay(next) : "")}
				autoFocus
			/>
			{selected ? (
				<div className="border-t p-1">
					<Button
						variant="ghost"
						size="sm"
						className="w-full justify-start"
						onClick={() => onChange("")}
					>
						Clear
					</Button>
				</div>
			) : null}
		</>
	);
}
