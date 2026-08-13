"use client";

import Email from "@carbon/icons-react/es/Email";
import FlowConnection from "@carbon/icons-react/es/FlowConnection";
import Locked from "@carbon/icons-react/es/Locked";
import Time from "@carbon/icons-react/es/Time";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import { Icon } from "./icon";
import { cn } from "../lib/utils";

export type FlowNodeStats = {
	sent: number;
	opened: number;
	clicked: number;
	replied: number;
};

export type EmailNodeData = {
	label: string;
	subject: string;
	stats?: FlowNodeStats | null;
	chip?: string | null;
	selected?: boolean;
};

export type WaitNodeData = { label: string };
export type LogicNodeData = { kind: string; label: string };
export type EntryNodeData = { label: string; detail?: string | null };
export type ExitNodeData = { label: string };

function percent(part: number, whole: number): string {
	if (whole === 0) return "—";
	return `${Math.round((part / whole) * 100)}%`;
}

function Stat({ children }: { children: ReactNode }) {
	return <span className="shrink-0 text-xs text-muted-foreground">{children}</span>;
}

function Target() {
	return <Handle type="target" position={Position.Top} isConnectable={false} />;
}

function Source({ id }: { id?: string }) {
	return (
		<Handle type="source" position={Position.Bottom} id={id} isConnectable={false} />
	);
}

export function EmailNode({ data, selected }: NodeProps) {
	const node = data as unknown as EmailNodeData;
	const stats = node.stats;

	return (
		<div
			className={cn(
				"w-[264px] overflow-clip rounded-lg border bg-card text-left",
				selected && "border-primary",
			)}
		>
			<Target />
			<div className="flex items-center gap-1.5 px-3 pt-2.5">
				<Icon icon={Email} className="size-3 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate font-medium text-xs">
					{node.label}
				</span>
				{node.chip ? (
					<span className="shrink-0 rounded-sm border px-1.5 py-px text-xs text-muted-foreground">
						{node.chip}
					</span>
				) : null}
			</div>
			<div className="truncate px-3 pt-0.5 pb-2.5 text-muted-foreground text-xs">
				{node.subject || "No subject yet"}
			</div>
			{stats ? (
				<div className="flex items-center gap-2 border-t bg-muted px-3 py-1.5">
					{stats.sent === 0 ? (
						<Stat>Nothing sent yet</Stat>
					) : (
						<>
							<Stat>{stats.sent.toLocaleString()} sent</Stat>
							<Stat>{percent(stats.opened, stats.sent)} open</Stat>
							<Stat>{percent(stats.clicked, stats.sent)} click</Stat>
							<Stat>{percent(stats.replied, stats.sent)} reply</Stat>
						</>
					)}
				</div>
			) : null}
			<Source />
		</div>
	);
}

export function WaitNode({ data, selected }: NodeProps) {
	const node = data as unknown as WaitNodeData;

	return (
		<div
			className={cn(
				"flex h-[30px] w-[140px] items-center justify-center gap-1.5 rounded-md border bg-card",
				selected && "border-primary",
			)}
		>
			<Target />
			<Icon icon={Time} className="size-3 shrink-0 text-muted-foreground" />
			<span className="text-xs">{node.label}</span>
			<Source />
		</div>
	);
}

export function LogicNode({ data, selected }: NodeProps) {
	const node = data as unknown as LogicNodeData;
	const branch = node.kind === "Branch";

	return (
		<div
			className={cn(
				"w-[224px] rounded-lg border bg-card px-3 py-2",
				selected && "border-primary",
			)}
		>
			<Target />
			<div className="flex items-center gap-1.5">
				<Icon
					icon={FlowConnection}
					className="size-3 shrink-0 text-muted-foreground"
				/>
				<span className="text-xs text-muted-foreground">{node.kind}</span>
			</div>
			<div className="truncate font-medium text-xs">{node.label}</div>
			{branch ? (
				<>
					<Handle
						type="source"
						position={Position.Bottom}
						id="yes"
						style={{ left: "30%" }}
						isConnectable={false}
					/>
					<Handle
						type="source"
						position={Position.Bottom}
						id="no"
						style={{ left: "70%" }}
						isConnectable={false}
					/>
				</>
			) : (
				<>
					<Handle
						type="source"
						position={Position.Bottom}
						id="a"
						style={{ left: "30%" }}
						isConnectable={false}
					/>
					<Handle
						type="source"
						position={Position.Bottom}
						id="b"
						style={{ left: "70%" }}
						isConnectable={false}
					/>
				</>
			)}
		</div>
	);
}

export function EntryNode({ data, selected }: NodeProps) {
	const node = data as unknown as EntryNodeData;

	return (
		<div
			className={cn(
				"flex w-[320px] flex-col items-center justify-center rounded-lg border bg-card px-3 py-2",
				selected && "border-primary",
			)}
		>
			<span className="max-w-full truncate font-medium text-xs">
				{node.label}
			</span>
			{node.detail ? (
				<span className="max-w-full truncate text-muted-foreground text-xs">
					{node.detail}
				</span>
			) : null}
			<Source />
		</div>
	);
}

export function ExitNode({ data }: NodeProps) {
	const node = data as unknown as ExitNodeData;

	return (
		<div className="flex h-[30px] w-[140px] items-center justify-center gap-1.5 rounded-md border bg-card">
			<Target />
			<Icon icon={Locked} className="size-3 shrink-0 text-muted-foreground" />
			<span className="text-xs">{node.label}</span>
		</div>
	);
}

export const FLOW_NODE_TYPES = {
	email: EmailNode,
	wait: WaitNode,
	logic: LogicNode,
	entry: EntryNode,
	exit: ExitNode,
};
