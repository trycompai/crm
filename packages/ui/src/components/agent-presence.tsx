import { cn } from "@crm/ui/lib/utils";
import { Slot } from "radix-ui";
import type * as React from "react";

function AgentFace({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden
			data-slot="agent-face"
			data-state="idle"
			fill="none"
			viewBox="0 0 24 24"
			className={cn("size-4 shrink-0 text-brand", className)}
		>
			<path
				d="M12 2.5l9.5 7.4v4.2L12 21.5l-9.5-7.4V9.9z"
				stroke="currentColor"
				strokeLinejoin="round"
				strokeWidth={1.6}
			/>
			<g fill="currentColor">
				<circle cx="9.6" cy="12" r="1.15" />
				<circle cx="14.4" cy="12" r="1.15" />
			</g>
		</svg>
	);
}

function AgentPresence({
	label,
	asChild = false,
	className,
	children,
	...props
}: Omit<React.ComponentProps<"button">, "aria-label"> & {
	label: string;
	asChild?: boolean;
}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="agent-presence"
			type={asChild ? undefined : "button"}
			aria-label={label}
			className={cn(
				"inline-flex h-8 shrink-0 items-center gap-2 rounded-lg bg-background px-2.5 font-medium text-13 text-foreground shadow-border outline-none transition-colors hover:bg-accent focus-visible:shadow-focus",
				className,
			)}
			{...props}
		>
			<Slot.Slottable>{children}</Slot.Slottable>
			<AgentFace />
			<span className="hidden max-w-48 truncate sm:inline">{label}</span>
		</Comp>
	);
}

export { AgentFace, AgentPresence };
