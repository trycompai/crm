"use client";

import CalendarGlyph from "@carbon/icons-react/es/Calendar";
import { DatePickerCalendar } from "@crm/ui/components/date-picker";
import { Icon } from "@crm/ui/components/icon";
import { InputGroupButton } from "@crm/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { fromDay } from "@crm/ui/lib/format";
import { useState } from "react";

const dueFormat = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
});

export function DueDateButton({
	value,
	onChange,
	disabled = false,
}: {
	value: string | null | undefined;
	onChange: (next: string) => void;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const selected = fromDay(value);

	const choose = (next: string) => {
		setOpen(false);
		onChange(next);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<InputGroupButton variant="ghost" size="xs" disabled={disabled}>
					<Icon icon={CalendarGlyph} data-icon="inline-start" />
					{selected ? dueFormat.format(selected) : "Due date"}
				</InputGroupButton>
			</PopoverTrigger>
			<PopoverContent size="fit" align="start">
				<DatePickerCalendar value={value} onChange={choose} />
			</PopoverContent>
		</Popover>
	);
}
