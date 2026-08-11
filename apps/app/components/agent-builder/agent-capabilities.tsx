"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Locked from "@carbon/icons-react/es/Locked";
import Warning from "@carbon/icons-react/es/Warning";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Icon } from "@crm/ui/components/icon";

export type Capabilities = {
	readable: boolean;
	problem: string | null;
	channel: { kind: "channel" | "user"; id: string; label: string } | null;
	actions: Array<{ type: string; provider: string; summary: string }>;
	dataScope: {
		mode: "SELECTED" | "WORKSPACE";
		summary: string;
		resources: Array<{ id: string; kind: string; label: string }>;
	} | null;
};

export function AgentCapabilities({
	capabilities,
}: {
	capabilities: Capabilities;
}) {
	if (!capabilities.readable) {
		return (
			<Alert variant="warning">
				<Icon icon={Warning} />
				<AlertTitle>This version's manifest cannot be read</AlertTitle>
				<AlertDescription>
					{capabilities.problem ?? "The manifest is not in a shape we know."}
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<div className="flex flex-col gap-9">
			<LivesIn channel={capabilities.channel} />
			<CanDo actions={capabilities.actions} />
			<CanSee dataScope={capabilities.dataScope} />
		</div>
	);
}

function LivesIn({ channel }: { channel: Capabilities["channel"] }) {
	return (
		<Section
			summary="One place. Change it and the agent moves."
			title="Lives in"
		>
			<div className="flex flex-col divide-y rounded-lg border">
				{channel ? (
					<div className="flex h-14 shrink-0 items-center gap-3 bg-muted px-4">
						<span className="flex w-5 shrink-0 items-center justify-center text-muted-foreground">
							{channel.kind === "user" ? (
								<Icon className="size-3.5" icon={Locked} motion="none" />
							) : (
								"#"
							)}
						</span>
						<div className="min-w-0 flex-1">
							<p className="font-medium text-sm">
								{channel.label.replace(/^#/, "")}
							</p>
							<p className="text-muted-foreground text-xs">
								{channel.kind === "user"
									? "A direct message to one person"
									: "Every message goes here"}
							</p>
						</div>
						<span className="flex w-20 shrink-0 items-center justify-end">
							<Icon
								className="size-4 text-success"
								icon={Checkmark}
								motion="none"
							/>
						</span>
					</div>
				) : (
					<p className="px-4 py-4 text-muted-foreground text-sm">
						This agent does not post to Slack.
					</p>
				)}
			</div>
		</Section>
	);
}

function CanDo({ actions }: { actions: Capabilities["actions"] }) {
	return (
		<Section
			summary="If it is not here, it cannot do it."
			title="What it can do there"
		>
			{actions.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Nothing outside the CRM.
				</p>
			) : (
				<div className="flex flex-col">
					{actions.map((action) => (
						<div
							className="flex items-center gap-3 border-b py-3 last:border-b-0"
							key={action.type}
						>
							<div className="min-w-0 flex-1">
								<p className="text-sm">{actionLabel(action.type)}</p>
								<p className="text-muted-foreground text-xs">
									{action.summary || action.provider}
								</p>
							</div>
							<span className="flex w-9 shrink-0 items-center justify-end">
								<Icon
									className="size-4 text-success"
									icon={Checkmark}
									motion="none"
								/>
							</span>
						</div>
					))}
				</div>
			)}
		</Section>
	);
}

function CanSee({ dataScope }: { dataScope: Capabilities["dataScope"] }) {
	const resources = dataScope?.resources ?? [];

	return (
		<Section
			summary={dataScope?.summary || "What it reads to do its job."}
			title="What it can see"
		>
			{dataScope?.mode === "WORKSPACE" && resources.length === 0 ? (
				<p className="text-sm">Every record in the workspace.</p>
			) : (
				<div className="flex flex-wrap gap-2">
					{resources.map((resource) => (
						<span
							className="flex h-7 items-center rounded-md border px-2.5 text-sm"
							key={`${resource.kind}:${resource.id}`}
						>
							{resource.label}
						</span>
					))}
					{resources.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nothing is picked yet.
						</p>
					) : null}
				</div>
			)}
		</Section>
	);
}

function Section({
	children,
	summary,
	title,
}: {
	children: React.ReactNode;
	summary: string;
	title: string;
}) {
	return (
		<section className="flex flex-col gap-3.5">
			<div>
				<h2 className="font-semibold text-lg tracking-tight">{title}</h2>
				<p className="text-muted-foreground text-sm">{summary}</p>
			</div>
			{children}
		</section>
	);
}

const ACTION_LABELS: Record<string, string> = {
	"slack.message.post": "Post a message",
	"crm.activity.create": "Write a note or task on the record",
	"run.summary": "Write a summary of the run",
};

function actionLabel(type: string): string {
	return ACTION_LABELS[type] ?? type;
}
