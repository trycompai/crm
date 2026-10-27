"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { useDiscardChanges } from "@crm/ui/components/discard-changes";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { type ComponentProps, useState } from "react";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CopyValue } from "../copy-value";

type CreatedApiKey = RouterOutputs["apiKeys"]["create"];

export function CreatedApiKeyDialog({
	apiKey,
	onOpenChange,
	onCloseAutoFocus,
}: {
	apiKey: CreatedApiKey | null;
	onOpenChange: (open: boolean) => void;
	onCloseAutoFocus?: ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
}) {
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const guard = useDiscardChanges({
		open: apiKey !== null,
		dirty: apiKey !== null && copiedId !== apiKey.id,
		onOpenChange: (next) => {
			if (!next) setCopiedId(null);
			onOpenChange(next);
		},
		wording: {
			title: "Close without copying the key?",
			description:
				"This is the only time the key is shown. Copy it before you close.",
			confirmLabel: "Close anyway",
			keepLabel: "Go back to the key",
		},
	});

	return (
		<Dialog open={apiKey !== null} onOpenChange={guard.onOpenChange}>
			<DialogContent
				onPointerDownOutside={(event) => event.preventDefault()}
				onCloseAutoFocus={(event) => {
					if (apiKey !== null) {
						event.preventDefault();
						return;
					}
					onCloseAutoFocus?.(event);
				}}
			>
				<DialogHeader>
					<DialogTitle>{apiKey?.name ?? "API key"} created</DialogTitle>
					<DialogDescription>
						Copy it now. Nobody, including us, can show it to you again.
					</DialogDescription>
				</DialogHeader>

				<InputGroup>
					<InputGroupInput
						value={apiKey?.key ?? ""}
						readOnly
						className="font-mono"
					/>
					<InputGroupAddon align="inline-end">
						<CopyValue
							value={apiKey?.key ?? ""}
							label="API key"
							onCopied={() => setCopiedId(apiKey?.id ?? null)}
						/>
					</InputGroupAddon>
				</InputGroup>

				<DialogFooter>
					<Button onClick={() => guard.onOpenChange(false)}>Done</Button>
				</DialogFooter>
			</DialogContent>
			{guard.dialog}
		</Dialog>
	);
}
