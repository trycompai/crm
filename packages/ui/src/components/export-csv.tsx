"use client";

import Download from "@carbon/icons-react/es/Download";
import { useState } from "react";
import { Button } from "./button";
import { Icon } from "./icon";
import { Spinner } from "./spinner";
import { CSV, type CsvColumn, csvFilename, toCsv } from "../lib/csv";

export type ExportCsvProps<TRow> = {
	name: string;
	label?: string;
	columns: CsvColumn<TRow>[];
	total: number;
	disabled?: boolean;
	fetchPage: (page: number, pageSize: number) => Promise<TRow[]>;
	onDone?: (rows: number, capped: boolean) => void;
	onError?: (message: string) => void;
};

export function ExportCsv<TRow>({
	name,
	label = "Export",
	columns,
	total,
	disabled = false,
	fetchPage,
	onDone,
	onError,
}: ExportCsvProps<TRow>) {
	const [running, setRunning] = useState(false);

	const run = async () => {
		setRunning(true);

		try {
			const rows: TRow[] = [];
			let page = 1;

			while (rows.length < total && rows.length < CSV.limit.rows) {
				const batch = await fetchPage(page, CSV.page.size);
				if (batch.length === 0) break;
				rows.push(...batch);
				page += 1;
			}

			const capped = rows.length < total;
			const blob = new Blob([toCsv(rows, columns)], { type: CSV.mime });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");

			anchor.href = url;
			anchor.download = csvFilename(name, new Date());
			anchor.click();
			URL.revokeObjectURL(url);

			onDone?.(rows.length, capped);
		} catch (error) {
			onError?.(error instanceof Error ? error.message : "The export failed.");
		} finally {
			setRunning(false);
		}
	};

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={disabled || running || total === 0}
			onClick={() => void run()}
		>
			{running ? <Spinner /> : <Icon icon={Download} data-icon="inline-start" />}
			{label}
		</Button>
	);
}
