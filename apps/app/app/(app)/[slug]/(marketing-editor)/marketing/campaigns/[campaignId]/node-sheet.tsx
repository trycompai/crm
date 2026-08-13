"use client";

import Close from "@carbon/icons-react/es/Close";
import Email from "@carbon/icons-react/es/Email";
import { Button } from "@crm/ui/components/button";
import {
	DEFAULT_SHELL,
	type EmailBlock,
	EmailBlockEditor,
} from "@crm/ui/components/email-blocks";
import { EmailPreview } from "@crm/ui/components/email-preview";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { saveLabel, useAutosave } from "@crm/ui/hooks/use-autosave";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EditShellLink } from "@/components/marketing/edit-shell-link";
import { useImageUpload } from "@/components/marketing/use-image-upload";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { AttachmentsPanel } from "./attachments-panel";
import { OpenPreview } from "./open-preview";
import { SaveAsTemplate } from "./save-as-template";
import { SendTest } from "./send-test";

type Campaign = RouterOutputs["marketingCampaigns"]["byId"];
type Node = Campaign["nodes"][number];
type Stats = Campaign["stats"][number];

function blocksOf(document: unknown): EmailBlock[] {
	if (!document || typeof document !== "object") return [];
	const blocks = (document as { blocks?: unknown }).blocks;
	return Array.isArray(blocks) ? (blocks as EmailBlock[]) : [];
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex w-[104px] shrink-0 flex-col gap-0.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="font-medium text-xs">{value}</span>
		</div>
	);
}

type NodeSheetProps = {
	node: Node;
	campaignId: string;
	recipients: number;
	stats: Stats | null;
	onClose: () => void;
	onSaved: () => void;
};

export function NodeSheet(props: NodeSheetProps) {
	return <NodeSheetBody key={props.node.id} {...props} />;
}

function NodeSheetBody({
	node,
	campaignId,
	recipients,
	stats,
	onClose,
	onSaved,
}: NodeSheetProps) {
	const trpc = useTRPC();
	const uploadImage = useImageUpload();
	const [subject, setSubject] = useState(node.subject ?? "");
	const [preheader, setPreheader] = useState(node.preheader ?? "");
	const [blocks, setBlocks] = useState<EmailBlock[]>(() =>
		blocksOf(node.document),
	);
	const [selected, setSelected] = useState<number | null>(null);
	const [touched, setTouched] = useState(false);

	useEffect(() => {
		if (touched) return;
		setSubject(node.subject ?? "");
		setPreheader(node.preheader ?? "");
		setBlocks(blocksOf(node.document));
	}, [node, touched]);

	const preview = useQuery(
		trpc.marketingCampaigns.previewNode.queryOptions({
			nodeId: node.id,
			subject,
			preheader,
			document: { version: 1, blocks } as unknown as Record<string, unknown>,
		}),
	);

	const save = useMutation(
		trpc.marketingCampaigns.updateNode.mutationOptions({
			onSuccess: () => onSaved(),
			onError: (error) => toast.error(error.message),
		}),
	);

	const status = useAutosave(
		{ subject, preheader, blocks },
		(draft) =>
			save.mutateAsync({
				nodeId: node.id,
				subject: draft.subject,
				preheader: draft.preheader || null,
				document: { version: 1, blocks: draft.blocks } as unknown as Record<
					string,
					unknown
				>,
			}),
		{ enabled: touched, onSaved: () => setTouched(false) },
	);

	const percent = (part: number, whole: number) =>
		whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;

	return (
		<aside className="flex w-[1000px] min-w-0 max-w-[80vw] flex-col overflow-hidden border-l bg-background">
			<header className="flex h-13 shrink-0 items-center gap-2 border-b px-4 py-3">
				<Icon
					icon={Email}
					className="size-3.5 shrink-0 text-muted-foreground"
				/>
				<span className="font-medium text-xs">{node.label ?? "Email"}</span>
				<span className="rounded-sm border px-1.5 py-px text-xs text-muted-foreground">
					Email
				</span>
				<div className="flex-1" />
				<Button
					variant="ghost"
					size="icon"
					onClick={onClose}
					aria-label="Close"
				>
					<Icon icon={Close} />
				</Button>
			</header>

			{stats ? (
				<div className="flex shrink-0 items-center gap-0 border-b px-4 py-3">
					<Stat label="Sent" value={stats.sent.toLocaleString()} />
					<Stat label="Delivered" value={stats.delivered.toLocaleString()} />
					<Stat label="Opened" value={percent(stats.opened, stats.sent)} />
					<Stat label="Clicked" value={percent(stats.clicked, stats.sent)} />
					<Stat label="Replied" value={percent(stats.replied, stats.sent)} />
					<Stat
						label="Unsubscribed"
						value={stats.unsubscribed.toLocaleString()}
					/>
				</div>
			) : null}

			<div className="flex min-h-0 flex-1 overflow-hidden">
				<div className="flex w-[360px] shrink-0 flex-col gap-4 overflow-y-auto overflow-x-hidden border-r p-4">
					<div className="flex flex-col gap-1.5">
						<Label
							htmlFor="node-subject"
							className="text-xs text-muted-foreground"
						>
							Subject
						</Label>
						<Input
							id="node-subject"
							value={subject}
							onChange={(event) => {
								setSubject(event.target.value);
								setTouched(true);
							}}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label
							htmlFor="node-preheader"
							className="text-xs text-muted-foreground"
						>
							Preheader
						</Label>
						<Input
							id="node-preheader"
							value={preheader}
							onChange={(event) => {
								setPreheader(event.target.value);
								setTouched(true);
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
							shell={{ ...DEFAULT_SHELL, action: <EditShellLink /> }}
							onChange={(next) => {
								setBlocks(next);
								setTouched(true);
							}}
						/>
					</div>

					<AttachmentsPanel campaignId={campaignId} recipients={recipients} />
				</div>

				<EmailPreview
					html={preview.data?.html ?? ""}
					text={preview.data?.text ?? ""}
					blocked={preview.data?.blocked ?? null}
					pending={preview.isPending}
				/>
			</div>

			<footer className="flex h-14 shrink-0 items-center gap-2 border-t px-4">
				<span className="text-muted-foreground text-xs">
					{saveLabel(status)}
				</span>
				<div className="flex-1" />
				<OpenPreview nodeId={node.id} disabled={touched} />
				<SaveAsTemplate nodeId={node.id} disabled={touched} />
				<SendTest
					nodeId={node.id}
					subject={subject}
					preheader={preheader}
					blocks={blocks}
				/>
				<Button variant="outline" onClick={onClose}>
					Close
				</Button>
			</footer>
		</aside>
	);
}
