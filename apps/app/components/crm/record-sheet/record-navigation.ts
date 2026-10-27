import type { RecordRef } from "./record-stack";

export type RecordQueueContext = {
	stack: readonly RecordRef[];
	orderedRecordRefs: readonly RecordRef[];
};

type RecordNavigationChange = {
	stack: RecordRef[];
	queues: RecordQueueContext[];
	history: "push" | "replace";
};

function sameRecord(left: RecordRef, right: RecordRef) {
	return left.kind === right.kind && left.id === right.id;
}

function isStackPrefix(
	prefix: readonly RecordRef[],
	stack: readonly RecordRef[],
) {
	return (
		prefix.length <= stack.length &&
		prefix.every((ref, index) => {
			const entry = stack[index];
			return entry !== undefined && sameRecord(ref, entry);
		})
	);
}

function findRecordQueue(
	stack: readonly RecordRef[],
	queues: readonly RecordQueueContext[],
) {
	return queues.find(
		(queue) =>
			queue.stack.length === stack.length && isStackPrefix(queue.stack, stack),
	);
}

function captureRecordQueue(
	stack: readonly RecordRef[],
	queues: readonly RecordQueueContext[],
	orderedRecordRefs?: readonly RecordRef[],
) {
	const next = queues.filter(
		(queue) =>
			queue.stack.length < stack.length && isStackPrefix(queue.stack, stack),
	);
	const top = stack.at(-1);
	if (top && orderedRecordRefs?.some((ref) => sameRecord(ref, top))) {
		next.push({
			stack: [...stack],
			orderedRecordRefs: [...orderedRecordRefs],
		});
	}
	return next;
}

export function getRecordNavigation(
	stack: readonly RecordRef[],
	queues: readonly RecordQueueContext[],
) {
	const queue = findRecordQueue(stack, queues);
	const top = stack.at(-1);
	if (!queue || !top) return null;
	const index = queue.orderedRecordRefs.findIndex((ref) =>
		sameRecord(ref, top),
	);
	return index < 0 ? null : { index, total: queue.orderedRecordRefs.length };
}

export function openRecordNavigation(
	stack: readonly RecordRef[],
	queues: readonly RecordQueueContext[],
	ref: RecordRef,
	orderedRecordRefs?: readonly RecordRef[],
): RecordNavigationChange {
	const next = [...stack.filter((entry) => !sameRecord(entry, ref)), ref];
	return {
		stack: next,
		queues: captureRecordQueue(next, queues, orderedRecordRefs),
		history: stack.length === 0 ? "push" : "replace",
	};
}

export function closeRecordNavigation(
	stack: readonly RecordRef[],
	queues: readonly RecordQueueContext[],
	all = false,
): RecordNavigationChange {
	const next = all ? [] : stack.slice(0, -1);
	return {
		stack: next,
		queues: queues.filter((queue) => isStackPrefix(queue.stack, next)),
		history: "replace",
	};
}

export function moveRecordNavigation(
	stack: readonly RecordRef[],
	queues: readonly RecordQueueContext[],
	direction: -1 | 1,
): RecordNavigationChange | null {
	const queue = findRecordQueue(stack, queues);
	const position = getRecordNavigation(stack, queues);
	if (!queue || !position) return null;
	const ref = queue.orderedRecordRefs[position.index + direction];
	if (!ref) return null;
	const next = [...stack.slice(0, -1), ref];
	return {
		stack: next,
		queues: captureRecordQueue(next, queues, queue.orderedRecordRefs),
		history: "replace",
	};
}
