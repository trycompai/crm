"use client";

import {
	InputGroup,
	InputGroupAddon,
	InputGroupTextarea,
} from "@crm/ui/components/input-group";
import type { ReactNode } from "react";

export function ActivityForm({
	value,
	onValueChange,
	placeholder,
	ariaLabel,
	autoFocus = false,
	onSubmit,
	onEscape,
	children,
}: {
	value: string;
	onValueChange: (next: string) => void;
	placeholder?: string;
	ariaLabel: string;
	autoFocus?: boolean;
	onSubmit: () => void;
	onEscape: () => void;
	children: ReactNode;
}) {
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<InputGroup>
				<InputGroupTextarea
					value={value}
					onChange={(event) => onValueChange(event.target.value)}
					placeholder={placeholder}
					aria-label={ariaLabel}
					autoFocus={autoFocus}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							onSubmit();
						}
						if (event.key === "Escape") onEscape();
					}}
				/>

				<InputGroupAddon align="block-end" className="gap-2 border-t">
					{children}
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
}
