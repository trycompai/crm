"use client";

import Upload from "@carbon/icons-react/es/Upload";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardPanel,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { COMPANY_IMPORT } from "@crm/validation/company-import";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useReducer, useState } from "react";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import {
	buildImportRows,
	type CompanyImportField,
	type CompanyImportMapping,
	createInitialMapping,
	parseCsv,
	reduceImportWizard,
} from "./csv-import";

const IMPORT_FIELDS: Array<{
	value: CompanyImportField;
	label: string;
}> = [
	{ value: "name", label: "Name" },
	{ value: "website", label: "Website or domain" },
	{ value: "phone", label: "Phone" },
	{ value: "city", label: "City" },
	{ value: "stateCode", label: "State or region" },
	{ value: "industry", label: "Industry" },
	{ value: "subIndustry", label: "Sub-industry" },
	{ value: "description", label: "Description" },
];

const FIELD_LABELS = new Map(
	IMPORT_FIELDS.map((field) => [field.value, field.label]),
);
const SKIP = "skip";
const PREVIEW_ROWS = 5;

function focusElement(element: HTMLElement | null) {
	element?.focus();
}

export function ImportWizard() {
	const workspaceUrl = useWorkspaceUrl();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [state, dispatch] = useReducer(reduceImportWizard, {
		step: "upload",
		message: "Choose a CSV file.",
	});
	const [reading, setReading] = useState(false);

	const importCompanies = useMutation(
		trpc.companies.import.mutationOptions({
			onSuccess: async (result) => {
				if (result.created > 0) await cache.company();
				dispatch({ type: "import-finished", result });
			},
			onError: (error) => dispatch({ type: "failed", message: error.message }),
		}),
	);

	async function readFile(file: File) {
		setReading(true);
		try {
			if (file.size > COMPANY_IMPORT.maxFileBytes) {
				throw new Error("The CSV file is larger than 5 MB.");
			}
			if (!file.name.toLowerCase().endsWith(".csv")) {
				throw new Error("Choose a file with a .csv extension.");
			}
			const parsed = parseCsv(await file.text());
			dispatch({
				type: "file-loaded",
				parsed,
				mapping: createInitialMapping(parsed.headers),
			});
		} catch (error) {
			dispatch({
				type: "failed",
				message:
					error instanceof Error
						? error.message
						: "The CSV file cannot be read.",
			});
		} finally {
			setReading(false);
		}
	}

	function startImport() {
		if (state.step !== "map") return;
		try {
			importCompanies.mutate({
				rows: buildImportRows(state.parsed, state.mapping),
			});
		} catch (error) {
			dispatch({
				type: "failed",
				message:
					error instanceof Error
						? error.message
						: "The column mapping is invalid.",
			});
		}
	}

	return (
		<div className="flex w-full max-w-3xl flex-col gap-4">
			<p className="sr-only" role="status" aria-live="polite">
				{state.message}
			</p>
			{state.step === "upload" ? (
				<UploadStep error={state.error} reading={reading} onFile={readFile} />
			) : null}
			{state.step === "map" ? (
				<MapStep
					parsed={state.parsed}
					mapping={state.mapping}
					error={state.error}
					pending={importCompanies.isPending}
					onMappingChange={(column, field) =>
						dispatch({ type: "mapping-changed", column, field })
					}
					onBack={() => dispatch({ type: "back" })}
					onImport={startImport}
				/>
			) : null}
			{state.step === "result" ? (
				<ResultStep
					result={state.result}
					companiesUrl={workspaceUrl("/companies")}
					onRestart={() => dispatch({ type: "restart" })}
				/>
			) : null}
		</div>
	);
}

function UploadStep({
	error,
	reading,
	onFile,
}: {
	error?: string;
	reading: boolean;
	onFile: (file: File) => Promise<void>;
}) {
	const inputId = useId();
	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h2 ref={focusElement} tabIndex={-1}>
						Choose a CSV file
					</h2>
				</CardTitle>
				<CardDescription>
					The first row must contain column names. Files can contain 5,000
					companies and must stay under 5 MB.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{error ? (
					<Alert variant="destructive">
						<AlertTitle>The file cannot be used</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				) : null}
				<FieldGroup>
					<Field data-disabled={reading || undefined}>
						<FieldLabel htmlFor={inputId}>CSV file</FieldLabel>
						<Input
							id={inputId}
							type="file"
							accept=".csv,text/csv"
							disabled={reading}
							onChange={(event) => {
								const file = event.currentTarget.files?.[0];
								event.currentTarget.value = "";
								if (file) void onFile(file);
							}}
						/>
						<FieldDescription>
							You can review every column before the import starts.
						</FieldDescription>
					</Field>
				</FieldGroup>
			</CardContent>
			{reading ? (
				<CardFooter divider="none">
					<Spinner /> Reading the file
				</CardFooter>
			) : null}
		</Card>
	);
}

function MapStep({
	parsed,
	mapping,
	error,
	pending,
	onMappingChange,
	onBack,
	onImport,
}: {
	parsed: { headers: string[]; rows: string[][] };
	mapping: CompanyImportMapping;
	error?: string;
	pending: boolean;
	onMappingChange: (column: number, field: CompanyImportField | null) => void;
	onBack: () => void;
	onImport: () => void;
}) {
	const mappedColumns = mapping.flatMap((field, column) =>
		field ? [{ field, column, key: `${field}:${column}` }] : [],
	);
	const columns = parsed.headers.map((header, column) => ({
		header,
		column,
		key: `${header}:${column}`,
	}));
	const previewRows = parsed.rows
		.slice(0, PREVIEW_ROWS)
		.map((row, rowIndex) => ({
			row,
			key: `${row.join("\u0000")}:${rowIndex}`,
		}));
	const hasName = mapping.includes("name");
	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h2 ref={focusElement} tabIndex={-1}>
						Match the columns
					</h2>
				</CardTitle>
				<CardDescription>
					Each company field can use one CSV column. Name is required.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{error ? (
					<Alert variant="destructive">
						<AlertTitle>The import cannot start</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				) : null}
				<CardPanel size="content">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>CSV column</TableHead>
								<TableHead>Company field</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{columns.map(({ header, column, key }) => {
								const field = mapping[column] ?? null;
								const selectId = `company-import-column-${column}`;
								return (
									<TableRow key={key}>
										<TableCell>
											<FieldLabel htmlFor={selectId}>{header}</FieldLabel>
										</TableCell>
										<TableCell>
											<Select
												value={field ?? SKIP}
												onValueChange={(value) =>
													onMappingChange(
														column,
														value === SKIP
															? null
															: (value as CompanyImportField),
													)
												}
											>
												<SelectTrigger id={selectId} className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														<SelectItem value={SKIP}>Do not import</SelectItem>
														{IMPORT_FIELDS.map((option) => (
															<SelectItem
																key={option.value}
																value={option.value}
																disabled={mapping.some(
																	(mapped, mappedColumn) =>
																		mappedColumn !== column &&
																		mapped === option.value,
																)}
															>
																{option.label}
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</CardPanel>
				{mappedColumns.length > 0 ? (
					<CardPanel size="content">
						<Table>
							<TableCaption>
								Previewing {Math.min(PREVIEW_ROWS, parsed.rows.length)} of{" "}
								{parsed.rows.length} rows
							</TableCaption>
							<TableHeader>
								<TableRow>
									{mappedColumns.map(({ field, key }) => (
										<TableHead key={key}>{FIELD_LABELS.get(field)}</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{previewRows.map(({ row, key }) => (
									<TableRow key={key}>
										{mappedColumns.map(({ column, key: columnKey }) => (
											<TableCell key={columnKey}>
												{row[column] || "Empty"}
											</TableCell>
										))}
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardPanel>
				) : null}
			</CardContent>
			<CardFooter>
				<Button onClick={onImport} disabled={pending || !hasName}>
					{pending ? <Spinner data-icon="inline-start" /> : null}
					{pending ? "Importing" : `Import ${parsed.rows.length} companies`}
				</Button>
				<Button variant="outline" onClick={onBack} disabled={pending}>
					Back
				</Button>
			</CardFooter>
		</Card>
	);
}

function ResultStep({
	result,
	companiesUrl,
	onRestart,
}: {
	result: {
		created: number;
		skipped: number;
		skips: Array<{ row: number; reason: string }>;
	};
	companiesUrl: string;
	onRestart: () => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h2 ref={focusElement} tabIndex={-1}>
						Import complete
					</h2>
				</CardTitle>
				<CardDescription>
					{result.created} companies imported. {result.skipped} rows skipped.
				</CardDescription>
			</CardHeader>
			{result.skips.length > 0 ? (
				<CardContent>
					<Alert>
						<AlertTitle>Skipped rows</AlertTitle>
						<AlertDescription>
							Fix these rows in the CSV file before importing them again.
						</AlertDescription>
					</Alert>
					<CardPanel size="content">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Row</TableHead>
									<TableHead>Reason</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{result.skips.map((skip) => (
									<TableRow key={skip.row}>
										<TableCell>{skip.row}</TableCell>
										<TableCell>{skip.reason}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardPanel>
				</CardContent>
			) : null}
			<CardFooter divider={result.skips.length > 0 ? "top" : "none"}>
				<Button asChild>
					<Link href={companiesUrl}>View companies</Link>
				</Button>
				<Button variant="outline" onClick={onRestart}>
					<Icon icon={Upload} data-icon="inline-start" />
					Import another file
				</Button>
			</CardFooter>
		</Card>
	);
}
