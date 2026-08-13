"use client";

import Attachment from "@carbon/icons-react/es/Attachment";
import Close from "@carbon/icons-react/es/Close";
import { MARKETING } from "@crm/db/marketing";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

function size(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	const mb = (bytes / (1024 * 1024)).toFixed(1);
	return `${mb.endsWith(".0") ? mb.slice(0, -2) : mb} MB`;
}

const LIMIT = size(MARKETING.attachments.totalBytes);

async function toBase64(file: File): Promise<string> {
	const url = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () =>
			reject(reader.error ?? new Error("That file could not be read."));
		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}
			reject(new Error("That file could not be read."));
		};
		reader.readAsDataURL(file);
	});

	const comma = url.indexOf(",");

	if (comma === -1) throw new Error("That file could not be read.");

	return url.slice(comma + 1);
}

export function AttachmentsPanel({
	campaignId,
	recipients,
}: {
	campaignId: string;
	recipients: number;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const input = useRef<HTMLInputElement>(null);
	const [inFlight, setInFlight] = useState(0);

	const attachments = useQuery(
		trpc.marketingCampaigns.attachments.queryOptions({ id: campaignId }),
	);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.marketingCampaigns.attachments.queryKey({
				id: campaignId,
			}),
		});

	const add = useMutation(
		trpc.marketingCampaigns.addAttachment.mutationOptions({
			onSuccess: async () => {
				toast.success("Attached.");
				await invalidate();
			},
			onError: (error) => toast.error(error.message),
			onSettled: () => setInFlight(0),
		}),
	);

	const remove = useMutation(
		trpc.marketingCampaigns.removeAttachment.mutationOptions({
			onSuccess: () => invalidate(),
			onError: (error) => toast.error(error.message),
		}),
	);

	const rows = attachments.data ?? [];
	const total = rows.reduce((sum, row) => sum + row.bytes, inFlight);
	const busy = inFlight > 0;

	return (
		<div className="flex flex-col gap-2">
			<span className="text-muted-foreground text-xs">Attachments</span>

			{rows.length > 0 ? (
				<div className="flex flex-col overflow-clip rounded-lg border">
					{rows.map((row) => (
						<div
							key={row.id}
							className="flex items-center gap-2 border-b px-2.5 py-2 last:border-b-0"
						>
							<Icon
								icon={Attachment}
								className="size-3 shrink-0 text-muted-foreground"
							/>
							<span className="min-w-0 flex-1 truncate text-xs">
								{row.filename}
							</span>
							<span className="shrink-0 text-muted-foreground text-xs">
								{size(row.bytes)}
							</span>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`Remove ${row.filename}`}
								disabled={remove.isPending}
								onClick={() => remove.mutate({ id: row.id })}
							>
								<Icon icon={Close} />
							</Button>
						</div>
					))}
				</div>
			) : null}

			<input
				ref={input}
				type="file"
				className="hidden"
				onChange={async (event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (!file || busy) return;

					if (file.size === 0) {
						toast.error("That file is empty, so there is nothing to attach.");
						return;
					}

					if (total + file.size > MARKETING.attachments.totalBytes) {
						toast.error(
							`That would take the attachments over ${LIMIT}, which Resend refuses.`,
						);
						return;
					}

					setInFlight(file.size);

					let contentBase64: string;

					try {
						contentBase64 = await toBase64(file);
					} catch (error) {
						setInFlight(0);
						toast.error(
							error instanceof Error
								? error.message
								: "That file could not be read.",
						);
						return;
					}

					add.mutate({
						campaignId,
						filename: file.name,
						mimeType: file.type || "application/octet-stream",
						contentBase64,
					});
				}}
			/>

			<Button
				size="sm"
				className="self-start"
				disabled={busy}
				onClick={() => input.current?.click()}
			>
				{busy ? (
					<Spinner />
				) : (
					<Icon icon={Attachment} data-icon="inline-start" />
				)}
				Attach a file
			</Button>

			{rows.length > 0 || busy ? (
				<span className="text-muted-foreground text-xs">
					{size(total)} of {LIMIT}.
					{recipients > 50
						? " Attachments cannot be batched, so this send will take far longer and lands worse."
						: ""}
				</span>
			) : null}
		</div>
	);
}
