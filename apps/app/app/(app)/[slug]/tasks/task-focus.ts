export function nextTaskFocusId(
	ids: string[],
	currentId: string,
	currentRemains: boolean,
): string | null {
	if (currentRemains) return currentId;

	const index = ids.indexOf(currentId);
	if (index < 0) return ids[0] ?? null;

	return ids[index + 1] ?? ids[index - 1] ?? null;
}
