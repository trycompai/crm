export type CsvParseResult = {
	headers: string[];
	rows: Record<string, string>[];
};

export function parseCsv(text: string): CsvParseResult {
	const records = parseRecords(text);
	if (records.length === 0) return { headers: [], rows: [] };

	const [headerRow, ...dataRows] = records as [string[], ...string[][]];
	const headers = headerRow.map((header) => header.trim());

	const rows = dataRows
		.filter((record) => record.some((cell) => cell.trim() !== ""))
		.map((record) => {
			const row: Record<string, string> = {};
			headers.forEach((header, index) => {
				row[header] = record[index] ?? "";
			});
			return row;
		});

	return { headers, rows };
}

function parseRecords(text: string): string[][] {
	const records: string[][] = [];
	let field = "";
	let record: string[] = [];
	let inQuotes = false;
	let i = 0;

	const pushField = () => {
		record.push(field);
		field = "";
	};
	const pushRecord = () => {
		pushField();
		records.push(record);
		record = [];
	};

	while (i < text.length) {
		const char = text[i];

		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i += 1;
				continue;
			}
			field += char;
			i += 1;
			continue;
		}

		if (char === '"') {
			inQuotes = true;
			i += 1;
			continue;
		}
		if (char === ",") {
			pushField();
			i += 1;
			continue;
		}
		if (char === "\r") {
			i += 1;
			continue;
		}
		if (char === "\n") {
			pushRecord();
			i += 1;
			continue;
		}
		field += char;
		i += 1;
	}

	if (field.length > 0 || record.length > 0) {
		pushRecord();
	}

	return records;
}
