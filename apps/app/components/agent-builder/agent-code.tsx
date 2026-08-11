"use client";

import { Button } from "@crm/ui/components/button";
import { SaveBar } from "@crm/ui/components/save-bar";
import {
	type FileContents,
	type FileOptions,
	parseDiffFromFile,
} from "@pierre/diffs";
import { Editor, type EditorOptions } from "@pierre/diffs/edit";
import { EditProvider, File, FileDiff, Virtualizer } from "@pierre/diffs/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const FILE_OPTIONS: FileOptions<undefined> = {
	theme: { dark: "pierre-dark-soft", light: "pierre-light-soft" },
	stickyHeader: true,
};

const DIFF_OPTIONS = {
	theme: { dark: "pierre-dark-soft", light: "pierre-light-soft" },
	diffStyle: "unified",
	stickyHeader: true,
} as const;

const VIRTUALIZER_STYLE = {
	maxHeight: "32rem",
	overflow: "auto",
} as const;

function createEditor(options: EditorOptions<undefined>) {
	return new Editor(options);
}

export function AgentCode({
	agentId,
	canManage,
}: {
	agentId: string;
	canManage: boolean;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [active, setActive] = useState<string | null>(null);
	const [editing, setEditing] = useState(false);
	const [showDiff, setShowDiff] = useState(false);
	const [changed, setChanged] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);
	const draft = useRef(new Map<string, string>());
	const editorRef = useRef<Editor<undefined> | null>(null);

	const code = useQuery(trpc.agents.files.queryOptions({ id: agentId }));
	const files = code.data?.files ?? [];
	const path = active ?? files[0]?.path ?? null;
	const file = files.find((entry) => entry.path === path);

	const save = useMutation(
		trpc.agents.saveFile.mutationOptions({
			onError: (error) => toast.error(error.message),
		}),
	);

	const saveAll = useCallback(async () => {
		setSaving(true);
		let failed = false;

		for (const [entry, contents] of [...draft.current]) {
			const written = await save
				.mutateAsync({
					id: agentId,
					clientRequestId: crypto.randomUUID(),
					path: entry,
					content: contents,
				})
				.then(
					() => true,
					() => false,
				);
			if (!written) {
				failed = true;
				break;
			}
			if (draft.current.get(entry) === contents) draft.current.delete(entry);
		}

		await queryClient.invalidateQueries({
			queryKey: trpc.agents.files.pathKey(),
		});
		const remaining = [...draft.current.keys()];
		setChanged(remaining);
		setSaving(false);
		if (failed || remaining.length > 0) return;

		setEditing(false);
		toast.success("Saved.");
	}, [agentId, queryClient, save, trpc]);

	const editorOptions = useMemo<EditorOptions<undefined>>(
		() => ({
			persistState: true,
			onAttach(editor) {
				editorRef.current = editor;
			},
			onChange(next) {
				draft.current.set(next.name, next.contents);
				setChanged((paths) =>
					paths.includes(next.name) ? paths : [...paths, next.name],
				);
			},
		}),
		[],
	);

	const surface = useMemo<FileContents | null>(() => {
		if (!file) return null;

		return {
			name: file.path,
			contents: draft.current.get(file.path) ?? file.content,
			cacheKey: `${file.path}:${file.revision}`,
		};
	}, [file]);

	const diff = useMemo(() => {
		if (!file?.previousContent || !surface) return null;

		return parseDiffFromFile(
			{
				name: file.path,
				contents: file.previousContent,
				cacheKey: `${file.path}:${file.revision - 1}`,
			},
			surface,
		);
	}, [file, surface]);

	const discard = useCallback(() => {
		draft.current.clear();
		setChanged([]);
		setEditing(false);
	}, []);

	if (files.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				{code.isPending
					? "Reading the agent's files…"
					: "This agent has no files yet. The builder writes them when it deploys."}
			</p>
		);
	}

	return (
		<EditProvider createEditor={createEditor}>
			<section className="flex flex-col gap-3.5">
				<div className="flex items-end justify-between gap-4">
					<div>
						<h2 className="font-semibold text-lg tracking-tight">Code</h2>
						<p className="text-muted-foreground text-sm">
							What the agent actually runs.
						</p>
					</div>

					<div className="flex items-center gap-2">
						{file?.previousContent ? (
							<Button
								onClick={() => setShowDiff((value) => !value)}
								size="sm"
								variant="outline"
							>
								{showDiff ? "Hide changes" : "Changes"}
							</Button>
						) : null}
						{canManage ? (
							<Button
								onClick={() => {
									setShowDiff(false);
									setEditing((value) => !value);
								}}
								size="sm"
								variant="outline"
							>
								{editing ? "Done" : "Edit"}
							</Button>
						) : null}
					</div>
				</div>

				<div className="overflow-hidden rounded-lg border">
					<div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b bg-muted/40">
						{files.map((entry) => (
							<button
								className={`flex items-center whitespace-nowrap border-r px-3 font-mono text-xs ${
									entry.path === path
										? "bg-background"
										: "text-muted-foreground hover:text-foreground"
								}`}
								key={entry.path}
								onClick={() => setActive(entry.path)}
								type="button"
							>
								{entry.path.split("/").pop()}
								{changed.includes(entry.path) ? (
									<span className="ml-1.5 size-1.5 rounded-full bg-warning" />
								) : null}
							</button>
						))}
					</div>

					{surface ? (
						<Virtualizer style={VIRTUALIZER_STYLE}>
							{showDiff && diff ? (
								<FileDiff fileDiff={diff} options={DIFF_OPTIONS} />
							) : (
								<File
									edit={editing}
									editorOptions={editorOptions}
									file={surface}
									options={FILE_OPTIONS}
								/>
							)}
						</Virtualizer>
					) : null}
				</div>
			</section>

			<SaveBar
				description={`${changed.length} file${changed.length === 1 ? "" : "s"} changed. Saving writes a new revision.`}
				open={changed.length > 0}
				title="Unsaved code"
			>
				<Button disabled={saving} onClick={discard} size="sm" variant="outline">
					Discard
				</Button>
				<Button
					disabled={saving}
					onClick={() => {
						void saveAll();
					}}
					size="sm"
				>
					{saving ? "Saving…" : "Save"}
				</Button>
			</SaveBar>
		</EditProvider>
	);
}
