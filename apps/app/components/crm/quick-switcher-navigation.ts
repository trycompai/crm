const TODAY_LABEL = "today";
const WORK_LABEL = "work";
const CUSTOMERS_LABEL = "customers";
const SERVICE_LABEL = "service";
const MARKETING_LABEL = "marketing";
const INSTANCES_LABEL = "instances";

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

export function showServiceNavigation(query: string): boolean {
	const normalized = query.trim().toLocaleLowerCase();
	return normalized === "" || SERVICE_LABEL.startsWith(normalized);
}

export function showMarketingNavigation(query: string): boolean {
	const normalized = query.trim().toLocaleLowerCase();
	return normalized === "" || MARKETING_LABEL.startsWith(normalized);
}

export function showInstancesNavigation(query: string): boolean {
	const normalized = query.trim().toLocaleLowerCase();
	return normalized === "" || INSTANCES_LABEL.startsWith(normalized);
}
