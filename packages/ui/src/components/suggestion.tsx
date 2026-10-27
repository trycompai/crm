"use client";

import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { CheckIcon, XIcon } from "lucide-react";
import type * as React from "react";

export function Suggestion({
	value,
	rationale,
	pending = false,
	onAccept,
	onDismiss,
}: {
	value: React.ReactNode;
	rationale?: React.ReactNode;
	pending?: boolean;
	onAccept: () => void;
	onDismiss: () => void;
}) {
	return (
		<div
			data-slot="suggestion"
			className="flex min-w-0 items-start gap-2 py-1 text-muted-foreground text-xs"
		>
			<div className="min-w-0 flex-1 space-y-0.5">
				<p className="truncate">
					<span className="text-foreground">{value}</span>
				</p>
				{rationale ? <p className="text-pretty">{rationale}</p> : null}
			</div>

			<div className="flex shrink-0 items-center gap-1">
				{pending ? (
					<Spinner className="size-3" />
				) : (
					<>
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={onAccept}
							aria-label="Accept"
						>
							<Icon icon={CheckIcon} />
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={onDismiss}
							aria-label="Dismiss"
						>
							<Icon icon={XIcon} />
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
