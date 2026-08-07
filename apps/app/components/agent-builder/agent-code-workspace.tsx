"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Renew from "@carbon/icons-react/es/Renew";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { File, MultiFileDiff } from "@pierre/diffs/react";
import {
	FileTree,
	useFileTree,
	useFileTreeSelection,
} from "@pierre/trees/react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { latestBuilderArtifacts } from "@/lib/agent-builder-state";
import { useHydrated } from "@/lib/use-hydrated";

export type AgentCodeArtifact = {
	id: string;
	versionId: string | null;
	path: string;
	language: string;
	content: string;
	previousContent: string | null;
	revision: number;
	status: "WRITING" | "READY";
	createdAt: string;
};

export function AgentCodeWorkspace({
	artifacts,
	working,
	versionId = null,
}: {
	artifacts: AgentCodeArtifact[];
	working: boolean;
	versionId?: string | null;
}) {
	const latest = latestBuilderArtifacts(artifacts, versionId);
	const paths = [...latest.keys()].sort();
	const treeKey = paths
		.map((path) => `${path}:${latest.get(path)?.status}`)
		.join("|");

	return (
		<AgentCodeWorkspaceSurface
			key={treeKey}
			latest={latest}
			paths={paths}
			working={working}
		/>
	);
}

function AgentCodeWorkspaceSurface({
	latest,
	paths,
	working,
}: {
	latest: Map<string, AgentCodeArtifact>;
	paths: string[];
	working: boolean;
}) {
	const [mode, setMode] = useState<"code" | "changes">("code");
	const hydrated = useHydrated();
	const { resolvedTheme } = useTheme();
	const { model } = useFileTree({
		paths,
		initialExpansion: "open",
		initialSelectedPaths: paths[0] ? [paths[0]] : [],
		gitStatus: paths.map((path) => ({
			path,
			status: latest.get(path)?.status === "READY" ? "added" : "modified",
		})),
	});
	const selection = useFileTreeSelection(model);
	const selectedPath =
		selection.find((path) => latest.has(path)) ?? paths[0] ?? null;
	const artifact = selectedPath ? latest.get(selectedPath) : null;
	const previous = artifact?.previousContent ?? null;
	const showChanges = mode === "changes" && previous !== null;

	if (!artifact) return null;
	if (!hydrated || (resolvedTheme !== "light" && resolvedTheme !== "dark")) {
		return (
			<section
				aria-label="Generated agent files"
				aria-busy="true"
				className="h-[412px] overflow-hidden rounded-lg bg-muted/40"
			>
				<span role="status" className="sr-only">
					Loading agent code
				</span>
			</section>
		);
	}
	const themeType = resolvedTheme;

	const file = {
		name: artifact.path,
		contents: artifact.content,
		lang: artifact.language,
		cacheKey: artifact.id,
	};

	return (
		<section
			aria-label="Generated agent files"
			className="overflow-hidden rounded-lg bg-muted/40"
		>
			<header className="flex min-h-11 flex-wrap items-center gap-2 px-3 py-2">
				<span
					className="flex min-w-0 flex-1 items-center gap-2"
					role={working ? "status" : undefined}
				>
					<Icon
						icon={working ? Renew : Checkmark}
						className={
							working ? "size-3.5 animate-spin text-ring" : "size-3.5 text-ring"
						}
						motion="none"
					/>
					<span className="truncate font-medium text-sm">
						{working ? "Writing agent code" : "Agent code"}
					</span>
					<span className="hidden shrink-0 text-muted-foreground text-xs sm:inline">
						{paths.length} {paths.length === 1 ? "file" : "files"}
					</span>
				</span>
				<fieldset
					className="flex min-w-0 items-center gap-1 border-0 p-0"
					aria-label="Code view"
				>
					<Button
						variant={mode === "code" ? "secondary" : "ghost"}
						size="xs"
						aria-pressed={mode === "code"}
						onClick={() => setMode("code")}
					>
						Code
					</Button>
					<Button
						variant={mode === "changes" ? "secondary" : "ghost"}
						size="xs"
						disabled={previous === null}
						aria-pressed={mode === "changes"}
						onClick={() => setMode("changes")}
					>
						Changes
					</Button>
				</fieldset>
			</header>

			<div className="mx-2 mb-2 grid min-h-0 overflow-hidden rounded-md bg-background md:grid-cols-[190px_minmax(0,1fr)]">
				<div className="h-36 min-w-0 border-b border-border/60 bg-muted/15 p-2 md:h-[360px] md:border-r md:border-b-0">
					<FileTree
						model={model}
						aria-label="Agent files"
						style={{ colorScheme: themeType, height: "100%", width: "100%" }}
					/>
				</div>
				<div className="h-80 min-w-0 overflow-auto bg-background md:h-[360px]">
					{showChanges ? (
						<MultiFileDiff
							oldFile={{
								name: artifact.path,
								contents: previous,
								lang: artifact.language,
								cacheKey: `${artifact.id}:previous`,
							}}
							newFile={file}
							options={{
								diffStyle: "unified",
								overflow: "wrap",
								themeType,
							}}
							disableWorkerPool
						/>
					) : (
						<File
							file={file}
							options={{ overflow: "wrap", themeType }}
							disableWorkerPool
						/>
					)}
				</div>
			</div>
		</section>
	);
}
