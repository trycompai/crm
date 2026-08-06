"use client";

import Draggable from "@carbon/icons-react/es/Draggable";
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Children, type ReactNode, useState } from "react";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";

function inOrder(
	children: ReactNode,
	ids: string[],
	order: string[],
): ReactNode {
	const slots = Children.toArray(children);
	if (slots.length !== ids.length) return children;

	const arranged: ReactNode[] = [];
	for (const id of order) {
		const at = ids.indexOf(id);
		if (at === -1) return children;
		arranged.push(slots[at]);
	}
	return arranged;
}

export function SortableList({
	ids,
	onReorder,
	children,
}: {
	ids: string[];
	onReorder: (ids: string[]) => void;
	children: ReactNode;
}) {
	const propKey = ids.join(" ");
	const [syncedKey, setSyncedKey] = useState(propKey);
	const [dragged, setDragged] = useState(ids);

	let order = dragged;
	if (syncedKey !== propKey) {
		setSyncedKey(propKey);
		setDragged(ids);
		order = ids;
	}

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const onDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const from = order.indexOf(String(active.id));
		const to = order.indexOf(String(over.id));
		if (from === -1 || to === -1) return;

		const next = arrayMove(order, from, to);
		setDragged(next);
		onReorder(next);
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			modifiers={[restrictToVerticalAxis, restrictToParentElement]}
			onDragEnd={onDragEnd}
		>
			<SortableContext items={order} strategy={verticalListSortingStrategy}>
				{inOrder(children, ids, order)}
			</SortableContext>
		</DndContext>
	);
}

export function SortableItem({
	id,
	label,
	className,
	children,
}: {
	id: string;
	label: string;
	className?: string;
	children: ReactNode;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });

	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={cn(
				"flex items-center gap-2.5",
				isDragging && "relative z-10 bg-background",
				className,
			)}
		>
			<Button
				ref={setActivatorNodeRef}
				type="button"
				variant="ghost"
				size="icon-xs"
				className="cursor-grab text-muted-foreground"
				{...attributes}
				{...listeners}
			>
				<Icon icon={Draggable} />
				<span className="sr-only">Reorder {label}</span>
			</Button>
			{children}
		</div>
	);
}
