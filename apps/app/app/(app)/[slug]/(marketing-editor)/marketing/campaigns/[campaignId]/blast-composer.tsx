"use client";

import { Button } from "@crm/ui/components/button";
import {
	DEFAULT_SHELL,
	type EmailBlock,
	EmailBlockEditor,
} from "@crm/ui/components/email-blocks";
import { EmailPreview } from "@crm/ui/components/email-preview";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CampaignKind } from "@/components/marketing/campaign-kind";
import { CopilotRail } from "@/components/marketing/copilot-rail";
import { EditShellLink } from "@/components/marketing/edit-shell-link";
import {
	MarketingEditorMeta,
	MarketingEditorShell,
} from "@/components/marketing/editor-shell";
import {
	type SegmentChoice,
	SegmentPicker,
	splitSegments,
} from "@/components/marketing/segment-picker";
import { useImageUpload } from "@/components/marketing/use-image-upload";
import { useCampaignOptionsInvalidation } from "@/components/marketing/use-marketing-facets";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { CampaignStatus } from "../../../../(marketing)/marketing/campaign-status";
import { AttachmentsPanel } from "./attachments-panel";
import { CampaignActions } from "./campaign-actions";
import { CampaignRecipients } from "./campaign-recipients";
import { CampaignResults } from "./campaign-results";
import { CampaignSettings } from "./campaign-settings";
import { OpenPreview } from "./open-preview";
import { SaveAsTemplate } from "./save-as-template";
import { ScheduleSend } from "./schedule-send";
import { SendTest } from "./send-test";

type Campaign = RouterOutputs["marketingCampaigns"]["byId"];

function blocksOf(document: unknown): EmailBlock[] {
	if (!document || typeof document !== "object") return [];
	const blocks = (document as { blocks?: unknown }).blocks;
	return Array.isArray(blocks) ? (blocks as EmailBlock[]) : [];
}

const BLAST_VIEWS = ["flow", "results", "recipients"] as const;

const BLAST_VIEW_LABEL: Record<(typeof BLAST_VIEWS)[number], string> = {
	flow: "Email",
	results: "Results",
	recipients: "Recipients",
};

export function BlastComposer({
	campaign,
	view,
	onViewChange,
	onChanged,
}: {
	campaign: Campaign;
	view: string;
	onViewChange: (view: (typeof BLAST_VIEWS)[number]) => void;
	onChanged: () => void;
}) {
	const trpc = useTRPC();
	const uploadImage = useImageUpload();
	const queryClient = useQueryClient();
	const workspaceUrl = useWorkspaceUrl();
	const invalidateCampaignOptions = useCampaignOptionsInvalidation();

	const node = campaign.nodes.find(
		(candidate: Campaign["nodes"][number]) => candidate.kind === "EMAIL",
	);

	const [subject, setSubject] = useState(node?.subject ?? "");
	const [preheader, setPreheader] = useState(node?.preheader ?? "");
	const [blocks, setBlocks] = useState<EmailBlock[]>(blocksOf(node?.document));
	const [selected, setSelected] = useState<number | null>(null);
	const [chosen, setChosen] = useState<SegmentChoice[]>(campaign.segments);
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		if (dirty || !node) return;
		setSubject(node.subject ?? "");
		setPreheader(node.preheader ?? "");
		setBlocks(blocksOf(node.document));
	}, [node, dirty]);

	const previewOptions = trpc.marketingCampaigns.previewNode.queryOptions({
		nodeId: node?.id ?? "",
		subject,
		preheader,
		document: { version: 1, blocks } as unknown as Record<string, unknown>,
	});

	const preview = useQuery({
		queryKey: previewOptions.queryKey,
		queryFn: previewOptions.queryFn,
		enabled: Boolean(node),
	});

	const saveNode = useMutation(
		trpc.marketingCampaigns.updateNode.mutationOptions({
			onSuccess: () => {
				setDirty(false);
				toast.success("Saved.");
				onChanged();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const saveAudience = useMutation(
		trpc.marketingCampaigns.update.mutationOptions({
			onSuccess: onChanged,
			onError: (error) => toast.error(error.message),
		}),
	);

	const rename = useMutation(
		trpc.marketingCampaigns.update.mutationOptions({
			onSuccess: () => {
				onChanged();
				void invalidateCampaignOptions();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const sent = campaign.status === "SENT" || campaign.status === "SENDING";
	const scheduled = campaign.status === "SCHEDULED";
	const findings = preview.data?.lint ?? [];
	const errors = findings.filter((finding) => finding.level === "error");
	const shown = sent
		? (BLAST_VIEWS.find((option) => option === view) ?? "flow")
		: "flow";
	const sends = chosen.filter((one) => one.mode === "INCLUDE");

	return (
		<MarketingEditorShell
			backHref={workspaceUrl("/marketing/campaigns")}
			backLabel="Campaigns"
			name={campaign.name}
			onNameChange={(next) => rename.mutate({ id: campaign.id, name: next })}
			badges={
				<>
					<CampaignKind
						campaignId={campaign.id}
						kind="BLAST"
						editable={campaign.status === "DRAFT"}
						dirty={dirty}
						onChanged={onChanged}
					/>
					<span className="shrink-0 text-xs">
						<CampaignStatus status={campaign.status} />
					</span>
				</>
			}
			tabs={
				sent ? (
					<ToggleGroup
						type="single"
						size="sm"
						value={shown}
						onValueChange={(next) => {
							const tab = BLAST_VIEWS.find((option) => option === next);
							onViewChange(tab ?? "flow");
						}}
					>
						{BLAST_VIEWS.map((option) => (
							<ToggleGroupItem key={option} value={option}>
								{BLAST_VIEW_LABEL[option]}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				) : null
			}
			actions={
				<>
					{sent || scheduled ? null : (
						<ScheduleSend
							campaignId={campaign.id}
							disabled={
								saveAudience.isPending ||
								errors.length > 0 ||
								sends.length === 0 ||
								dirty
							}
							onSent={() => {
								onChanged();
								void queryClient.invalidateQueries({
									queryKey: trpc.marketingCampaigns.list.queryKey(),
								});
							}}
						/>
					)}

					<CampaignSettings
						campaignId={campaign.id}
						kind="BLAST"
						fromName={campaign.fromName}
						replyTo={campaign.replyTo}
						cooldownDays={campaign.reentryCooldownDays}
						maxPasses={campaign.maxPasses}
						onChanged={onChanged}
					/>

					<CampaignActions
						campaignId={campaign.id}
						status={campaign.status}
						inFlight={campaign.inFlight}
						onChanged={onChanged}
					/>
				</>
			}
			meta={
				<MarketingEditorMeta
					parts={[
						sends.length > 0
							? `${campaign.audience.sendable.toLocaleString()} will receive this`
							: "No segment yet",
						errors.length > 0
							? `${errors.length} error${errors.length === 1 ? "" : "s"} to fix`
							: "Checks clean",
					]}
				/>
			}
			rail={
				<CopilotRail
					record={{ kind: "campaign", id: campaign.id, campaignKind: "BLAST" }}
					onFinish={onChanged}
				/>
			}
		>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				{shown === "recipients" ? (
					<CampaignRecipients campaignId={campaign.id} />
				) : shown === "results" ? (
					<CampaignResults campaign={campaign} />
				) : (
					<div className="flex min-h-0 flex-1">
						<div className="flex w-[360px] shrink-0 flex-col gap-4 overflow-y-auto overflow-x-hidden border-r p-4">
							<SegmentPicker
								value={chosen}
								disabled={saveAudience.isPending}
								onChange={(next) => {
									const previous = chosen;
									setChosen(next);
									saveAudience.mutate(
										{ id: campaign.id, ...splitSegments(next) },
										{ onError: () => setChosen(previous) },
									);
								}}
							/>

							<div className="flex flex-col gap-1.5">
								<Label
									htmlFor="blast-subject"
									className="text-muted-foreground text-xs"
								>
									Subject
								</Label>
								<Input
									id="blast-subject"
									value={subject}
									onChange={(event) => {
										setSubject(event.target.value);
										setDirty(true);
									}}
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label
									htmlFor="blast-preheader"
									className="text-muted-foreground text-xs"
								>
									Preheader
								</Label>
								<Input
									id="blast-preheader"
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

							<AttachmentsPanel
								campaignId={campaign.id}
								recipients={campaign.audience.sendable}
							/>
						</div>

						<EmailPreview
							html={preview.data?.html ?? ""}
							text={preview.data?.text ?? ""}
							blocked={preview.data?.blocked ?? null}
							pending={preview.isPending}
						/>
					</div>
				)}

				{shown === "flow" ? (
					<footer className="flex h-14 shrink-0 items-center gap-3 border-t px-4">
						<span className="font-medium text-sm tabular-nums">
							{campaign.audience.sendable.toLocaleString()}
						</span>
						<span className="min-w-0 truncate text-muted-foreground text-xs">
							{sends.length > 0
								? campaign.audience.excluded > 0
									? `people will receive this · ${campaign.audience.excluded.toLocaleString()} excluded of ${campaign.audience.total.toLocaleString()} in the segment`
									: `people will receive this · ${campaign.audience.total.toLocaleString()} in the segment`
								: "Choose a segment to see who gets this"}
						</span>

						{errors.length > 0 ? (
							<span className="min-w-0 truncate text-destructive text-xs">
								{errors[0]?.message}
							</span>
						) : saveAudience.isPending ? (
							<span className="shrink-0 text-muted-foreground text-xs">
								Saving who gets this
							</span>
						) : dirty ? (
							<span className="shrink-0 text-muted-foreground text-xs">
								Save before sending
							</span>
						) : null}

						<span className="flex-1" />

						<Button
							variant="outline"
							disabled={!node || saveNode.isPending || !dirty}
							onClick={() =>
								node &&
								saveNode.mutate({
									nodeId: node.id,
									subject,
									preheader: preheader || null,
									document: { version: 1, blocks } as unknown as Record<
										string,
										unknown
									>,
								})
							}
						>
							{saveNode.isPending ? <Spinner /> : null}
							Save
						</Button>

						<SendTest
							nodeId={node?.id ?? null}
							subject={subject}
							preheader={preheader}
							blocks={blocks}
							disabled={errors.length > 0}
							variant="outline"
						/>

						<SaveAsTemplate nodeId={node?.id ?? null} disabled={dirty} />

						<OpenPreview nodeId={node?.id ?? null} disabled={dirty} />
					</footer>
				) : null}
			</div>
		</MarketingEditorShell>
	);
}
