"use client";

import Locked from "@carbon/icons-react/es/Locked";
import {
	type EmailBlock,
	EmailBlockEditor,
} from "@crm/ui/components/email-blocks";
import { EmailPreview } from "@crm/ui/components/email-preview";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { saveLabel, useAutosave } from "@crm/ui/hooks/use-autosave";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CopilotRail } from "@/components/marketing/copilot-rail";
import {
	MarketingEditorMeta,
	MarketingEditorShell,
} from "@/components/marketing/editor-shell";
import { useImageUpload } from "@/components/marketing/use-image-upload";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

function blocksOf(document: unknown): EmailBlock[] {
	if (!document || typeof document !== "object") return [];
	const blocks = (document as { blocks?: unknown }).blocks;
	return Array.isArray(blocks) ? (blocks as EmailBlock[]) : [];
}

export function ShellEditor({ shellId }: { shellId: string }) {
	const trpc = useTRPC();
	const uploadImage = useImageUpload();
	const queryClient = useQueryClient();
	const workspaceUrl = useWorkspaceUrl();

	const shell = useQuery(
		trpc.marketingTemplates.shellById.queryOptions({ id: shellId }),
	);

	const [name, setName] = useState("");
	const [blocks, setBlocks] = useState<EmailBlock[]>([]);
	const [selected, setSelected] = useState<number | null>(null);
	const [dirty, setDirty] = useState(false);

	const data = shell.data;

	useEffect(() => {
		if (!data || dirty) return;
		setName(data.name);
		setBlocks(blocksOf(data.document));
	}, [data, dirty]);

	const previewOptions = trpc.marketingTemplates.previewShell.queryOptions({
		id: shellId,
		document: { version: 1, blocks } as unknown as Record<string, unknown>,
	});

	const preview = useQuery({
		queryKey: previewOptions.queryKey,
		queryFn: previewOptions.queryFn,
	});

	const save = useMutation(
		trpc.marketingTemplates.savePartial.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.marketingTemplates.shellById.queryKey({ id: shellId }),
				});
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const status = useAutosave(
		{ name, blocks },
		(draft) =>
			save.mutateAsync({
				id: shellId,
				name: draft.name,
				document: { version: 1, blocks: draft.blocks } as unknown as Record<
					string,
					unknown
				>,
			}),
		{ enabled: dirty, onSaved: () => setDirty(false) },
	);

	if (shell.isPending) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center">
				<Spinner />
			</div>
		);
	}

	if (!data) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground text-xs">
				That is gone.
			</div>
		);
	}

	return (
		<MarketingEditorShell
			backHref={workspaceUrl("/marketing/templates")}
			backLabel="Templates"
			name={name}
			onNameChange={(next) => {
				setName(next);
				setDirty(true);
			}}
			badges={
				<span className="shrink-0 rounded-sm border px-1.5 py-px text-muted-foreground text-xs">
					{data.kind === "HEADER" ? "Header" : "Footer"}
				</span>
			}
			actions={
				<span className="text-muted-foreground text-xs">
					{saveLabel(status)}
				</span>
			}
			meta={
				<MarketingEditorMeta
					parts={[
						data.isDefault ? "The default" : "Not the default",
						data.usedBy === 0
							? "No template picks it"
							: `${data.usedBy} template${data.usedBy === 1 ? "" : "s"}`,
						"No campaign can change this. Every email carries it.",
					]}
				/>
			}
			rail={
				<CopilotRail
					record={{ kind: "shell", id: shellId }}
					onFinish={() =>
						queryClient.invalidateQueries({
							queryKey: trpc.marketingTemplates.shellById.queryKey({
								id: shellId,
							}),
						})
					}
				/>
			}
		>
			<div className="flex w-[400px] shrink-0 flex-col gap-4 overflow-y-auto overflow-x-hidden border-r p-4">
				{data.kind === "HEADER" ? (
					<div className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-2">
						<Icon
							icon={Locked}
							className="size-3 shrink-0 text-muted-foreground"
						/>
						<span className="shrink-0 rounded-sm bg-background px-1.5 py-px text-muted-foreground text-xs">
							Brand line
						</span>
						<span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
							{data.brandLine.logoUrl
								? "Your logo, from your brand"
								: `${data.brandLine.workspaceName ?? "Your workspace name"}, in bold`}
						</span>
					</div>
				) : null}

				<EmailBlockEditor
					onUploadImage={uploadImage}
					blocks={blocks}
					selected={selected}
					onSelect={setSelected}
					onChange={(next) => {
						setBlocks(next);
						setDirty(true);
					}}
				/>

				<p className="text-muted-foreground text-xs">
					{data.kind === "HEADER"
						? "The brand line is drawn from your logo, and the postal address and the unsubscribe link go on every send. They are not blocks and nothing here can remove them. Anything you add sits under the brand line."
						: "The postal address and the unsubscribe link go on every send. They are not blocks and nothing here can remove them."}
				</p>
			</div>

			<EmailPreview
				html={preview.data?.html ?? ""}
				text={preview.data?.text ?? ""}
				blocked={preview.data?.blocked ?? null}
				pending={preview.isPending}
				note="An email with this header and footer, exactly as it sends"
			/>
		</MarketingEditorShell>
	);
}
