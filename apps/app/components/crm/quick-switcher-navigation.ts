const WORK_LABEL = "work";

export function showWorkNavigation(query: string): boolean {
	const normalized = query.trim().toLocaleLowerCase();
	return normalized === "" || WORK_LABEL.startsWith(normalized);
}
