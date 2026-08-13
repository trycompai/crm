"use client";

import { EMAIL_WIDTH } from "@crm/email/theme";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { type ReactNode, useState } from "react";

export const EMAIL_PREVIEW = {
	devices: ["desktop", "mobile", "text"],
	label: { desktop: "Desktop", mobile: "Mobile", text: "Plain text" },
	width: { desktop: EMAIL_WIDTH, mobile: 390, text: EMAIL_WIDTH },
	note: "Exactly what sends",
} as const;

export type EmailPreviewDevice = (typeof EMAIL_PREVIEW.devices)[number];

export function EmailPreview({
	html,
	text,
	blocked,
	pending,
	lead,
	note = EMAIL_PREVIEW.note,
}: {
	html: string;
	text: string;
	blocked?: string | null;
	pending?: boolean;
	lead?: ReactNode;
	note?: string;
}) {
	const [device, setDevice] = useState<EmailPreviewDevice>("desktop");
	const width = EMAIL_PREVIEW.width[device];

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted">
			<div className="flex h-13 shrink-0 items-center gap-3 border-b bg-background px-4">
				{lead}
				<ToggleGroup
					type="single"
					size="sm"
					value={device}
					onValueChange={(next) => {
						const chosen = EMAIL_PREVIEW.devices.find((one) => one === next);
						if (chosen) setDevice(chosen);
					}}
				>
					{EMAIL_PREVIEW.devices.map((one) => (
						<ToggleGroupItem key={one} value={one}>
							{EMAIL_PREVIEW.label[one]}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<div className="flex-1" />
				<span className="shrink-0 text-muted-foreground text-xs">
					{note}
				</span>
			</div>

			<div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
				{pending ? (
					<Spinner className="m-auto" />
				) : blocked ? (
					<p className="m-auto max-w-sm text-center text-muted-foreground text-xs">
						{blocked}
					</p>
				) : device === "text" ? (
					<pre
						style={{ width }}
						className="mx-auto h-fit whitespace-pre-wrap rounded-lg border bg-background p-5 text-xs"
					>
						{text}
					</pre>
				) : (
					<iframe
						title="Email preview"
						srcDoc={html}
						sandbox=""
						style={{ width }}
						className="mx-auto min-h-0 flex-1 rounded-lg border bg-background"
					/>
				)}
			</div>
		</div>
	);
}
