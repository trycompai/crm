export type ParsedCsv = { headers: string[]; rows: string[][] };

export function parseCsv(text: string): ParsedCsv {
	const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const records = parseRecords(normalized);
	const [first, ...rest] = records;
	if (!first) return { headers: [], rows: [] };
	return { headers: first, rows: rest.filter((r) => r.some(Boolean)) };
}

function parseRecords(text: string): string[][] {
	const records: string[][] = [];
	let pos = 0;

	while (pos <= text.length) {
		const [fields, next] = parseRecord(text, pos);
		records.push(fields);
		pos = next;
		if (pos >= text.length) break;
		pos++;
	}

	return records;
}

function parseRecord(text: string, start: number): [string[], number] {
	const fields: string[] = [];
	let pos = start;

	while (pos <= text.length) {
		const [field, next] = parseField(text, pos);
		fields.push(field);
		pos = next;
		if (pos >= text.length || text[pos] === "\n") break;
		pos++;
	}

	return [fields, pos];
}

function parseField(text: string, start: number): [string, number] {
	if (text[start] !== '"') {
		const end = findUnquotedEnd(text, start);
		return [text.slice(start, end), end];
	}

	let value = "";
	let pos = start + 1;

	while (pos < text.length) {
		if (text[pos] === '"') {
			if (text[pos + 1] === '"') {
				value += '"';
				pos += 2;
			} else {
				pos++;
				break;
			}
		} else {
			value += text[pos];
			pos++;
		}
	}

	return [value, pos];
}

function findUnquotedEnd(text: string, start: number): number {
	let pos = start;
	while (pos < text.length && text[pos] !== "," && text[pos] !== "\n") {
		pos++;
	}
	return pos;
}
