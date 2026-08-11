const TODAY_LABEL = "today";
const WORK_LABEL = "work";
const CUSTOMERS_LABEL = "customers";

export function showTodayNavigation(query: string): boolean {
	const normalized = query.trim().toLocaleLowerCase();
	return normalized === "" || TODAY_LABEL.startsWith(normalized);
}

export function showWorkNavigation(query: string): boolean {
	const normalized = query.trim().toLocaleLowerCase();
	return normalized === "" || WORK_LABEL.startsWith(normalized);
}

export function showCustomersNavigation(query: string): boolean {
	const normalized = query.trim().toLocaleLowerCase();
	return normalized === "" || CUSTOMERS_LABEL.startsWith(normalized);
}
