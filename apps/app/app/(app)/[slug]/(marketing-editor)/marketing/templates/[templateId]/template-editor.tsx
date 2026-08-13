"use client";

import OverflowMenuVertical from "@carbon/icons-react/es/OverflowMenuVertical";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import {
	DEFAULT_SHELL,
	type EmailBlock,
	EmailBlockEditor,
} from "@crm/ui/components/email-blocks";
import { EmailPreview } from "@crm/ui/components/email-preview";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { saveLabel, useAutosave } from "@crm/ui/hooks/use-autosave";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CopilotRail } from "@/components/marketing/copilot-rail";
import { EditShellLink } from "@/components/marketing/edit-shell-link";
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

export function TemplateEditor({ templateId }: { templateId: string }) {
	const trpc = useTRPC();
	const uploadImage = useImageUpload();
	const queryClient = useQueryClient();
	const workspaceUrl = useWorkspaceUrl();
	const router = useRouter();

	const template = useQuery(
		trpc.marketingTemplates.byId.queryOptions({ id: templateId }),
	);

	const [name, setName] = useState("");
	const [subject, setSubject] = useState("");
	const [preheader, setPreheader] = useState("");
	const [blocks, setBlocks] = useState<EmailBlock[]>([]);
	const [selected, setSelected] = useState<number | null>(null);
	const [dirty, setDirty] = useState(false);

	const data = template.data;

	useEffect(() => {
		if (!data || dirty) return;
		setName(data.name);
		setSubject(data.subject);
		setPreheader(data.preheader ?? "");
		setBlocks(blocksOf(data.document));
	}, [data, dirty]);

	const document = { version: 1 as const, blocks };

	const previewOptions = trpc.marketingTemplates.preview.queryOptions({
		document: document as unknown as Record<string, unknown>,
		subject,
		preheader,
		contactId: null,
	});

	const preview = useQuery({
		queryKey: previewOptions.queryKey,
		queryFn: previewOptions.queryFn,
	});

	const save = useMutation(
		trpc.marketingTemplates.update.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.marketingTemplates.byId.queryKey({ id: templateId }),
				});
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const duplicate = useMutation(
		trpc.marketingTemplates.duplicate.mutationOptions({
			onSuccess: (result) => {
				toast.success("Copied.");
				router.push(workspaceUrl(`/marketing/templates/${result.id}`));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const archive = useMutation(
		trpc.marketingTemplates.archive.mutationOptions({
			onSuccess: () => {
				toast.success("Archived.");
				router.push(workspaceUrl("/marketing/templates"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const sendTest = useMutation(
		trpc.marketing.sendTest.mutationOptions({
			onSuccess: (result) => toast.success(`Sent to ${result.to}.`),
			onError: (error) => toast.error(error.message),
		}),
	);

	const status = useAutosave(
		{ name, subject, preheader, blocks },
		(draft) =>
			save.mutateAsync({
				id: templateId,
				name: draft.name,
				subject: draft.subject,
				preheader: draft.preheader || null,
				document: { version: 1, blocks: draft.blocks } as unknown as Record<
					string,
					unknown
				>,
			}),
		{ enabled: dirty, onSaved: () => setDirty(false) },
	);

	if (template.isPending) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center">
				<Spinner />
			</div>
		);
	}

	if (!data) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground text-xs">
				That template is gone.
			</div>
		);
	}

	const findings = preview.data?.lint ?? [];
	const errors = findings.filter((finding) => finding.level === "error");
	const empty =
		data.subject.trim() === "" && blocksOf(data.document).length === 0;

	return (
		<MarketingEditorShell
			backHref={workspaceUrl("/marketing/templates")}
			backLabel="Templates"
			name={name}
			onNameChange={(next) => {
				setName(next);
				setDirty(true);
			}}
			actions={
				<>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" aria-label="More">
								<Icon icon={OverflowMenuVertical} />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								disabled={sendTest.isPending}
								onSelect={() => sendTest.mutate()}
							>
								Send me a test
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={duplicate.isPending}
								onSelect={() => duplicate.mutate({ id: templateId })}
							>
								Duplicate
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								disabled={archive.isPending}
								onSelect={() => archive.mutate({ id: templateId })}
							>
								Archive
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<span className="text-muted-foreground text-xs">
						{saveLabel(status)}
					</span>
				</>
			}
			meta={
				<MarketingEditorMeta
					parts={[
						data.usedBy === 0
							? "Never used"
							: `Used by ${data.usedBy} campaign${data.usedBy === 1 ? "" : "s"}`,
						errors.length > 0
							? `${errors.length} error${errors.length === 1 ? "" : "s"} to fix`
							: "Checks clean",
					]}
				/>
			}
			rail={
				<CopilotRail
					record={{ kind: "template", id: templateId, empty }}
					onFinish={() =>
						queryClient.invalidateQueries({
							queryKey: trpc.marketingTemplates.byId.queryKey({
								id: templateId,
							}),
						})
					}
				/>
			}
		>
			<div className="flex w-[400px] shrink-0 flex-col gap-4 overflow-y-auto overflow-x-hidden border-r p-4">
				<div className="flex flex-col gap-1.5">
					<Label
						htmlFor="template-subject"
						className="text-muted-foreground text-xs"
					>
						Subject
					</Label>
					<Input
						id="template-subject"
						value={subject}
						onChange={(event) => {
							setSubject(event.target.value);
							setDirty(true);
						}}
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label
						htmlFor="template-preheader"
						className="text-muted-foreground text-xs"
					>
						Preheader
					</Label>
					<Input
						id="template-preheader"
						value={preheader}
						onChange={(event) => {
							setPreheader(event.target.value);
							setDirty(true);
						}}
					/>
				</div>

				<div className="flex flex-col gap-2">
					<span className="text-muted-foreground text-xs">Body</span>
					<EmailBlockEditor
						onUploadImage={uploadImage}
						blocks={blocks}
						selected={selected}
						onSelect={setSelected}
						onChange={(next) => {
							setBlocks(next);
							setDirty(true);
						}}
						shell={{ ...DEFAULT_SHELL, action: <EditShellLink /> }}
					/>
				</div>
			</div>

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<EmailPreview
					html={preview.data?.html ?? ""}
					text={preview.data?.text ?? ""}
					blocked={preview.data?.blocked ?? null}
					pending={preview.isPending}
				/>

				{findings.length > 0 ? (
					<div className="flex shrink-0 flex-col border-t bg-background">
						<div className="flex items-center justify-between border-b px-4 py-2">
							<span className="font-medium text-xs">
								{findings.length} thing{findings.length === 1 ? "" : "s"} to
								look at
							</span>
							<span className="text-muted-foreground text-xs">
								{errors.length === 0
									? "No errors — this can be sent"
									: `${errors.length} must be fixed before this sends`}
							</span>
						</div>
						{findings.slice(0, 4).map((finding) => (
							<div
								key={`${finding.code}-${finding.blockIndex ?? "x"}`}
								className="flex items-center gap-2 border-b px-4 py-2 text-xs last:border-b-0"
							>
								<span
									className={
										finding.level === "error"
											? "size-1.5 shrink-0 rounded-sm bg-destructive"
											: "size-1.5 shrink-0 rounded-sm bg-muted-foreground"
									}
								/>
								{finding.message}
							</div>
						))}
					</div>
				) : null}
			</div>
		</MarketingEditorShell>
	);
}
