"use client";

import "../styles/flow-tokens.css";

import {
	Background,
	BackgroundVariant,
	Controls,
	type Edge,
	type Node,
	type NodeMouseHandler,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ContextMenu, ContextMenuTrigger } from "./context-menu";
import { FLOW_NODE_TYPES } from "./flow-nodes";
import { cn } from "../lib/utils";

export type FlowCanvasProps = {
	menu?: ReactNode;
	nodes: Node[];
	edges: Edge[];
	selectedId?: string | null;
	onNodeClick?: NodeMouseHandler;
	onNodeContextMenu?: NodeMouseHandler;
	onPaneClick?: () => void;
	onPaneContextMenu?: () => void;
	onNodeMoved?: (id: string, position: { x: number; y: number }) => void;
	className?: string;
	fitKey?: string;
};

function useMeasuredBox() {
	const ref = useRef<HTMLDivElement>(null);
	const [drawable, setDrawable] = useState(false);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const box = element.getBoundingClientRect();
		setDrawable(box.width > 0 && box.height > 0);

		const observer = new ResizeObserver((entries) => {
			const size = entries[0]?.contentRect;
			if (size) setDrawable(size.width > 0 && size.height > 0);
		});
		observer.observe(element);

		return () => observer.disconnect();
	}, []);

	return { ref, drawable };
}

function Fitter({ fitKey }: { fitKey?: string }) {
	const flow = useReactFlow();

	useEffect(() => {
		const frame = requestAnimationFrame(() => {
			void flow.fitView({ padding: 0.18, maxZoom: 1 });
		});
		return () => cancelAnimationFrame(frame);
	}, [flow, fitKey]);

	return null;
}

function Canvas({
	nodes,
	edges,
	onNodeClick,
	onNodeContextMenu,
	onPaneClick,
	onPaneContextMenu,
	onNodeMoved,
	className,
	fitKey,
	menu,
}: FlowCanvasProps) {
	const { ref, drawable } = useMeasuredBox();

	const surface = (
		<div
			ref={ref}
			className={cn("crm-flow relative min-h-0 min-w-0 flex-1", className)}
		>
			{drawable ? (
				<ReactFlow
					nodes={nodes}
					edges={edges}
					nodeTypes={FLOW_NODE_TYPES}
					onNodeClick={onNodeClick}
					onNodeContextMenu={onNodeContextMenu}
					onPaneClick={() => onPaneClick?.()}
					onPaneContextMenu={() => onPaneContextMenu?.()}
					onNodeDragStop={(_event, node) =>
						onNodeMoved?.(node.id, { x: node.position.x, y: node.position.y })
					}
					nodesConnectable={false}
					edgesFocusable={false}
					proOptions={{ hideAttribution: true }}
					minZoom={0.3}
					maxZoom={1.5}
					className="bg-muted"
				>
					<Background variant={BackgroundVariant.Dots} gap={20} size={1} />
					<Controls showInteractive={false} position="bottom-left" />
					<Fitter fitKey={fitKey} />
				</ReactFlow>
			) : null}
		</div>
	);

	if (!menu) return surface;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{surface}</ContextMenuTrigger>
			{menu}
		</ContextMenu>
	);
}

export function FlowCanvas(props: FlowCanvasProps) {
	return (
		<ReactFlowProvider>
			<Canvas {...props} />
		</ReactFlowProvider>
	);
}

export type { Edge as FlowEdge, Node as FlowNode } from "@xyflow/react";
