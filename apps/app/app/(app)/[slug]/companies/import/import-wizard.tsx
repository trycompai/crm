"use client";

import CheckmarkFilled from "@carbon/icons-react/es/CheckmarkFilled";
import ErrorFilled from "@carbon/icons-react/es/ErrorFilled";
import Upload from "@carbon/icons-react/es/Upload";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { cn } from "@crm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { type ParsedCsv, parseCsv } from "./csv-parse";

type Step = "upload" | "map" | "result";

type CrmField =
	| "name"
	| "phone"
	| "city"
	| "stateCode"
	| "industry"
	| "subIndustry"
	| "website"
	| "description"
	| "_skip";

const CRM_FIELDS: { value: CrmField; label: string; required?: true }[] = [
	{ value: "name", label: "Name", required: true },
	{ value: "phone", label: "Phone" },
	{ value: "city", label: "City" },
	{ value: "stateCode", label: "State / Region" },
	{ value: "industry", label: "Industry" },
	{ value: "subIndustry", label: "Sub-industry" },
	{ value: "website", label: "Website" },
	{ value: "description", label: "Description" },
];

const PREVIEW_ROWS = 5;

function guessMapping(header: string): CrmField {
	const h = header.toLowerCase().replace(/[^a-z]/g, "");
	if (h === "name" || h === "company" || h === "companyname") return "name";
	if (h === "phone" || h === "telephone" || h === "mobile") return "phone";
	if (h === "city" || h === "town") return "city";
	if (h === "state" || h === "statecode" || h === "region" || h === "province")
		return "stateCode";
	if (h === "industry" || h === "sector") return "industry";
	if (h === "subindustry" || h === "subsector" || h === "vertical")
		return "subIndustry";
	if (h === "website" || h === "url" || h === "domain" || h === "web")
		return "website";
	if (h === "description" || h === "about" || h === "notes")
		return "description";
	return "_skip";
}

type ImportResult = {
	created: number;
	skipped: number;
	skips: { row: number; reason: string }[];
};

export function ImportWizard() {
	const workspaceUrl = useWorkspaceUrl();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [step, setStep] = useState<Step>("upload");
	const [parsed, setParsed] = useState<ParsedCsv | null>(null);
	const [mapping, setMapping] = useState<Record<string, CrmField>>({});
	const [result, setResult] = useState<ImportResult | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	const importMutation = useMutation(
		trpc.companies.import.mutationOptions({
			onSuccess: async (data) => {
				setResult(data);
				setStep("result");
				if (data.created > 0) await cache.company();
			},
			onError: (err) => toast.error(err.message),
		}),
	);

	const loadFile = useCallback((file: File) => {
		if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
			toast.error("Please upload a .csv file.");
			return;
		}
		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target?.result;
			if (typeof text !== "string") return;
			const result = parseCsv(text);
			if (result.headers.length === 0) {
				toast.error("The CSV file has no headers.");
				return;
			}
			const initial: Record<string, CrmField> = {};
			for (const h of result.headers) initial[h] = guessMapping(h);
			setParsed(result);
			setMapping(initial);
			setStep("map");
		};
		reader.readAsText(file);
	}, []);

	const onDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setDragOver(false);
			const file = e.dataTransfer.files[0];
			if (file) loadFile(file);
		},
		[loadFile],
	);

	const onFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) loadFile(file);
		},
		[loadFile],
	);

	const confirm = useCallback(() => {
		if (!parsed) return;
		const nameField = Object.entries(mapping).find(
			([, v]) => v === "name",
		)?.[0];
		if (!nameField) {
			toast.error("Map at least one column to Name before importing.");
			return;
		}
		const rows = parsed.rows.map((row) => {
			const obj: Record<string, string> = {};
			for (const [header, field] of Object.entries(mapping)) {
				if (field === "_skip") continue;
				const idx = parsed.headers.indexOf(header);
				obj[field] = row[idx] ?? "";
			}
			return obj as {
				name: string;
				phone?: string;
				city?: string;
				stateCode?: string;
				industry?: string;
				subIndustry?: string;
				website?: string;
				description?: string;
			};
		});
		importMutation.mutate({ rows });
	}, [parsed, mapping, importMutation]);

	const mappedFields = Object.values(mapping).filter((v) => v !== "_skip");
	const previewRows = parsed?.rows.slice(0, PREVIEW_ROWS) ?? [];
	const previewHeaders =
		parsed?.headers.filter((h) => mapping[h] !== "_skip") ?? [];

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
			<Steps current={step} />

			{step === "upload" && (
				<div className="flex flex-col gap-4">
					<button
						type="button"
						aria-label="Upload CSV"
						className={cn(
							"flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 text-center transition-colors",
							dragOver
								? "border-ring bg-muted"
								: "border-border hover:border-ring/50 hover:bg-muted/40",
						)}
						onDragOver={(e) => {
							e.preventDefault();
							setDragOver(true);
						}}
						onDragLeave={() => setDragOver(false)}
						onDrop={onDrop}
						onClick={() => fileRef.current?.click()}
					>
						<Icon icon={Upload} className="size-8 text-muted-foreground" />
						<div>
							<p className="font-medium text-sm">
								Drop a CSV file here, or click to browse
							</p>
							<p className="text-muted-foreground text-xs mt-1">
								First row must be column headers
							</p>
						</div>
					</button>
					<input
						ref={fileRef}
						type="file"
						accept=".csv,text/csv"
						className="hidden"
						onChange={onFileChange}
					/>
				</div>
			)}

			{step === "map" && parsed && (
				<div className="flex flex-col gap-6">
					<div className="flex flex-col gap-3">
						<p className="text-sm font-medium">
							Map CSV columns to company fields
						</p>
						<div className="rounded-lg border overflow-hidden">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-1/2">CSV column</TableHead>
										<TableHead>CRM field</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{parsed.headers.map((header) => (
										<TableRow key={header}>
											<TableCell className="font-mono text-xs">
												{header}
											</TableCell>
											<TableCell>
												<Select
													value={mapping[header] ?? "_skip"}
													onValueChange={(v) =>
														setMapping((m) => ({
															...m,
															[header]: v as CrmField,
														}))
													}
												>
													<SelectTrigger className="h-7 text-xs">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="_skip">
															<span className="text-muted-foreground">
																— Skip —
															</span>
														</SelectItem>
														{CRM_FIELDS.map((f) => (
															<SelectItem key={f.value} value={f.value}>
																{f.label}
																{f.required ? " *" : ""}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</div>

					{previewHeaders.length > 0 && (
						<div className="flex flex-col gap-2">
							<p className="text-sm font-medium">
								Preview — first {Math.min(PREVIEW_ROWS, parsed.rows.length)}{" "}
								rows
							</p>
							<div className="rounded-lg border overflow-auto">
								<Table>
									<TableHeader>
										<TableRow>
											{previewHeaders.map((h) => (
												<TableHead key={h} className="whitespace-nowrap">
													{CRM_FIELDS.find((f) => f.value === mapping[h])
														?.label ?? mapping[h]}
												</TableHead>
											))}
										</TableRow>
									</TableHeader>
									<TableBody>
										{previewRows.map((row) => (
											<TableRow key={row.join("\x00")}>
												{previewHeaders.map((h) => (
													<TableCell key={h} className="max-w-[180px] truncate">
														{row[parsed.headers.indexOf(h)] || (
															<span className="text-muted-foreground">—</span>
														)}
													</TableCell>
												))}
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</div>
					)}

					<p className="text-muted-foreground text-xs">
						{parsed.rows.length} row{parsed.rows.length !== 1 ? "s" : ""}{" "}
						detected.{" "}
						{mappedFields.includes("name") ? null : (
							<span className="text-destructive">
								Map a column to Name to continue.
							</span>
						)}
					</p>

					<div className="flex gap-2">
						<Button
							onClick={confirm}
							disabled={
								importMutation.isPending || !mappedFields.includes("name")
							}
						>
							{importMutation.isPending ? <Spinner /> : null}
							Import {parsed.rows.length} row
							{parsed.rows.length !== 1 ? "s" : ""}
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								setStep("upload");
								setParsed(null);
							}}
						>
							Back
						</Button>
					</div>
				</div>
			)}

			{step === "result" && result && (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-2">
							<Icon icon={CheckmarkFilled} className="size-5 text-primary" />
							<span className="font-medium text-sm">
								{result.created} compan{result.created !== 1 ? "ies" : "y"}{" "}
								imported
							</span>
						</div>
						{result.skipped > 0 && (
							<div className="flex items-start gap-2">
								<Icon
									icon={ErrorFilled}
									className="size-5 text-muted-foreground mt-0.5"
								/>
								<span className="text-sm text-muted-foreground">
									{result.skipped} row{result.skipped !== 1 ? "s" : ""} skipped
								</span>
							</div>
						)}
					</div>

					{result.skips.length > 0 && (
						<div className="rounded-lg border overflow-hidden">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Row</TableHead>
										<TableHead>Reason skipped</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{result.skips.map((s) => (
										<TableRow key={s.row}>
											<TableCell>{s.row}</TableCell>
											<TableCell className="text-muted-foreground">
												{s.reason}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}

					<div className="flex gap-2">
						<Button asChild>
							<Link href={workspaceUrl("/companies")}>Go to Companies</Link>
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								setStep("upload");
								setParsed(null);
								setResult(null);
							}}
						>
							Import another file
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

function Steps({ current }: { current: Step }) {
	const steps: { key: Step; label: string }[] = [
		{ key: "upload", label: "Upload" },
		{ key: "map", label: "Map columns" },
		{ key: "result", label: "Result" },
	];
	const currentIdx = steps.findIndex((s) => s.key === current);
	return (
		<ol className="flex items-center gap-0">
			{steps.map((s, i) => {
				const done = i < currentIdx;
				const active = i === currentIdx;
				return (
					<li key={s.key} className="flex items-center gap-0 min-w-0">
						<span
							className={cn(
								"flex items-center gap-1.5 text-xs font-medium px-1",
								active
									? "text-foreground"
									: done
										? "text-muted-foreground"
										: "text-muted-foreground/50",
							)}
						>
							<span
								className={cn(
									"flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
									active
										? "bg-primary text-primary-foreground"
										: done
											? "bg-muted text-muted-foreground"
											: "border border-border text-muted-foreground/50",
								)}
							>
								{i + 1}
							</span>
							{s.label}
						</span>
						{i < steps.length - 1 && (
							<span className="mx-1 text-border text-xs select-none">›</span>
						)}
					</li>
				);
			})}
		</ol>
	);
}
