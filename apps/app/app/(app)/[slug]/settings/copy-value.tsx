"use client";

import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

export function CopyValue({
	value,
	label,
	onCopied,
}: {
	value: string;
	label: string;
	onCopied?: () => void;
}) {
	const unavailable = () =>
		toast.error(
			`Could not copy the ${label.toLowerCase()}. Select it instead.`,
		);

	return (
		<Button
			variant="ghost"
			size="icon"
			type="button"
			onClick={() => {
				const clipboard = navigator.clipboard;

				if (!clipboard) {
					unavailable();
					return;
				}

				clipboard
					.writeText(value)
					.then(() => {
						toast.success(`${label} copied.`);
						onCopied?.();
					})
					.catch(unavailable);
			}}
		>
			<Icon icon={CopyIcon} />
			<span className="sr-only">Copy {label.toLowerCase()}</span>
		</Button>
	);
}
