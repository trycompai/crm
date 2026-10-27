"use client";

import { Button } from "@crm/ui/components/button";
import { Calendar } from "@crm/ui/components/calendar";
import { Icon } from "@crm/ui/components/icon";
import { InputGroupButton } from "@crm/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { formatDay, fromDay, toDay } from "@crm/ui/lib/format";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";

export function DueDateButton({
	value,
	onChange,
	disabled,
}: {
	value: string | null;
	onChange: (next: string) => void;
	disabled: boolean;
}) {
	const [open, setOpen] = useState(false);
	const selected = fromDay(value);
	const choose = (next: string) => {
		onChange(next);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<InputGroupButton variant="ghost" size="xs" disabled={disabled}>
					<Icon icon={CalendarIcon} data-icon="inline-start" />
					{selected ? formatDay(value) : "Due date"}
				</InputGroupButton>
			</PopoverTrigger>
			<PopoverContent size="fit" align="start">
				<Calendar
					mode="single"
					selected={selected}
					defaultMonth={selected}
					onSelect={(next) => choose(next ? toDay(next) : "")}
					autoFocus
				/>
				{selected ? (
					<div className="border-t p-1">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="w-full justify-start"
							onClick={() => choose("")}
						>
							Clear due date
						</Button>
					</div>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
