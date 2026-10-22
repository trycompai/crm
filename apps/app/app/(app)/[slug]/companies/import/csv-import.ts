import {
	COMPANY_IMPORT,
	type CompanyImportRow,
	companyImportInput,
} from "@crm/validation/company-import";

export type ParsedCsv = {
	headers: string[];
	rows: string[][];
};

export type CompanyImportField = Exclude<keyof CompanyImportRow, undefined>;
export type CompanyImportMapping = Array<CompanyImportField | null>;

export type CompanyImportResult = {
	created: number;
	skipped: number;
	skips: Array<{ row: number; reason: string }>;
};

export type ImportWizardState =
	| { step: "upload"; message: string; error?: string }
	| {
			step: "map";
			message: string;
			parsed: ParsedCsv;
			mapping: CompanyImportMapping;
			error?: string;
	  }
	| {
			step: "result";
			message: string;
			result: CompanyImportResult;
	  };

export type ImportWizardAction =
	| {
			type: "file-loaded";
			parsed: ParsedCsv;
			mapping: CompanyImportMapping;
	  }
	| {
			type: "mapping-changed";
			column: number;
			field: CompanyImportField | null;
	  }
	| { type: "back" }
	| { type: "failed"; message: string }
	| { type: "import-finished"; result: CompanyImportResult }
	| { type: "restart" };

const HEADER_ALIASES = {
	name: "name",
	company: "name",
	companyname: "name",
	account: "name",
	accountname: "name",
	phone: "phone",
	telephone: "phone",
	mobile: "phone",
	city: "city",
	town: "city",
	state: "stateCode",
	statecode: "stateCode",
	region: "stateCode",
	province: "stateCode",
	industry: "industry",
	sector: "industry",
	subindustry: "subIndustry",
	subsector: "subIndustry",
	vertical: "subIndustry",
	website: "website",
	url: "website",
	domain: "website",
	web: "website",
	description: "description",
	about: "description",
	notes: "description",
} as const satisfies Record<string, CompanyImportField>;

export function parseCsv(text: string): ParsedCsv {
	const records = parseRecords(text.replace(/^\uFEFF/, ""));
	const [headerRecord, ...dataRecords] = records;
	if (!headerRecord || headerRecord.every((field) => field.trim() === "")) {
		throw new Error("The CSV file has no headers.");
	}

	const headers = headerRecord.map((header) => header.trim());
	for (const [index, header] of headers.entries()) {
		if (header === "") throw new Error(`Column ${index + 1} needs a header.`);
	}

	if (dataRecords.length === 0) {
		throw new Error("The CSV file has no company rows.");
	}
	if (dataRecords.length > COMPANY_IMPORT.maxRows) {
		throw new Error(
			`The CSV file has ${dataRecords.length} rows. The limit is ${COMPANY_IMPORT.maxRows}.`,
		);
	}

	for (const [index, row] of dataRecords.entries()) {
		if (row.length !== headers.length) {
			throw new Error(
				`Row ${index + 2} has ${row.length} columns. The header has ${headers.length}.`,
			);
		}
	}

	return { headers, rows: dataRecords };
}

export function createInitialMapping(headers: string[]): CompanyImportMapping {
	const used = new Set<CompanyImportField>();
	return headers.map((header) => {
		const key = header.toLowerCase().replace(/[^a-z]/g, "");
		const field = HEADER_ALIASES[key as keyof typeof HEADER_ALIASES];
		if (!field || used.has(field)) return null;
		used.add(field);
		return field;
	});
}

export function buildImportRows(
	parsed: ParsedCsv,
	mapping: CompanyImportMapping,
): CompanyImportRow[] {
	if (mapping.length !== parsed.headers.length) {
		throw new Error("Map every CSV column before importing.");
	}

	const mappedFields = mapping.filter(
		(field): field is CompanyImportField => field !== null,
	);
	if (!mappedFields.includes("name")) {
		throw new Error("Map one CSV column to Name before importing.");
	}
	if (new Set(mappedFields).size !== mappedFields.length) {
		throw new Error("Each company field can use only one CSV column.");
	}

	const rows = parsed.rows.map((row) => {
		const company: Partial<Record<CompanyImportField, string>> = {};
		for (const [column, field] of mapping.entries()) {
			if (field) company[field] = row[column] ?? "";
		}
		return company;
	});

	return companyImportInput.parse({ rows }).rows;
}

export function reduceImportWizard(
	state: ImportWizardState,
	action: ImportWizardAction,
): ImportWizardState {
	if (action.type === "file-loaded") {
		return {
			step: "map",
			message: `${action.parsed.rows.length} company rows are ready to map.`,
			parsed: action.parsed,
			mapping: action.mapping,
		};
	}
	if (action.type === "mapping-changed" && state.step === "map") {
		const mapping = state.mapping.map((field, column) => {
			if (column === action.column) return action.field;
			if (action.field && field === action.field) return null;
			return field;
		});
		return { ...state, mapping, error: undefined };
	}
	if (action.type === "back") {
		return { step: "upload", message: "Choose a CSV file." };
	}
	if (action.type === "failed") {
		return state.step === "result"
			? state
			: { ...state, error: action.message };
	}
	if (action.type === "import-finished") {
		return {
			step: "result",
			message: `${action.result.created} companies imported.`,
			result: action.result,
		};
	}
	if (action.type === "restart") {
		return { step: "upload", message: "Choose a CSV file." };
	}
	return state;
}

function parseRecords(text: string): string[][] {
	const records: string[][] = [];
	let record: string[] = [];
	let field = "";
	let quoted = false;
	let closedQuote = false;
	let rowNumber = 1;

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index] ?? "";
		const next = text[index + 1];

		if (quoted) {
			if (character === '"' && next === '"') {
				field += '"';
				index += 1;
				continue;
			}
			if (character === '"') {
				quoted = false;
				closedQuote = true;
				continue;
			}
			field += character === "\r" && next === "\n" ? "\n" : character;
			if (character === "\r" && next === "\n") index += 1;
			continue;
		}

		if (
			closedQuote &&
			character !== "," &&
			character !== "\n" &&
			character !== "\r"
		) {
			throw new Error(`Row ${rowNumber} has text after a quoted field.`);
		}
		if (character === '"') {
			if (field !== "")
				throw new Error(`Row ${rowNumber} has an unexpected quote.`);
			quoted = true;
			closedQuote = false;
			continue;
		}
		if (character === ",") {
			record.push(field);
			field = "";
			closedQuote = false;
			continue;
		}
		if (character === "\n" || character === "\r") {
			record.push(field);
			records.push(record);
			record = [];
			field = "";
			closedQuote = false;
			rowNumber += 1;
			if (character === "\r" && next === "\n") index += 1;
			continue;
		}
		field += character;
	}

	if (quoted)
		throw new Error(`Row ${rowNumber} has an unterminated quoted field.`);
	if (field !== "" || record.length > 0) {
		record.push(field);
		records.push(record);
	}
	return records;
}
