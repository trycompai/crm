export type SortDirection = "asc" | "desc";

export type TableQueryState = {
	sort: string;
	dir: SortDirection;
	page: number;
	pageSize: number;
	tab: string;
	tabId?: string;
	filters: Record<string, string[]>;
	toggleSort: (id: string) => void;
	setSort: (id: string) => void;
	setDir: (dir: SortDirection) => void;
	setPage: (page: number) => Promise<void>;
	setTab: (value: string) => void;
	setFilter: (id: string, values: string[]) => void;
};
