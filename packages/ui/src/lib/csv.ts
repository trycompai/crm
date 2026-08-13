export const CSV = {
	page: { size: 100 },
	limit: { rows: 50_000 },
	mime: "text/csv;charset=utf-8",
} as const;

export type CsvColumn<TRow> = {
	header: string;
	value: (row: TRow) => unknown;
};

function cell(value: unknown): string {
	if (value === null || value === undefined) return "";

	const raw =
		value instanceof Date
			? value.toISOString()
			: typeof value === "object"
				? JSON.stringify(value)
				: String(value);

	const text =
		/^[=+\-@\t\r]/.test(raw) && Number.isNaN(Number(raw)) ? `'${raw}` : raw;

	return /["\n\r,]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv<TRow>(rows: TRow[], columns: CsvColumn<TRow>[]): string {
	const lines = [columns.map((column) => cell(column.header)).join(",")];

	for (const row of rows) {
		lines.push(columns.map((column) => cell(column.value(row))).join(","));
	}

	return `${lines.join("\r\n")}\r\n`;
}

export function csvFilename(name: string, stamp: Date): string {
	const day = stamp.toISOString().slice(0, 10);
	const safe = name.replaceAll(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "");
	return `${safe || "export"}-${day}.csv`;
}
