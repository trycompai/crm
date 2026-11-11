"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { parseCsv } from "@/lib/csv";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const ACCEPTED_COLUMNS =
	"company_name, company_domain, industry, country, country_code, " +
	"first_name, last_name, email, title, linkedin_url, account_type, " +
	"lead_source, idioma, evento_de_origem, mensagem_gancho, abordagem_sugerida";

export function ImportPanel() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspaceUrl = useWorkspaceUrl();
	const fileInput = useRef<HTMLInputElement>(null);

	const [fileName, setFileName] = useState<string | null>(null);
	const [rows, setRows] = useState<Record<string, string>[] | null>(null);

	const contactFields = useQuery(
		trpc.fields.list.queryOptions({
			entity: "CONTACT",
			includeArchived: false,
		}),
	);

	const preview = useMutation(
		trpc.import.preview.mutationOptions({
			onError: (error) => toast.error(error.message),
		}),
	);

	const commit = useMutation(
		trpc.import.commit.mutationOptions({
			onSuccess: async (data) => {
				await cache.everything();
				toast.success(
					`Importação concluída: ${data.companiesCreated} empresa(s) e ` +
						`${data.contactsCreated} contato(s) criados.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	async function pick(file: File | undefined) {
		if (!file) return;

		const text = await file.text();
		const parsed = parseCsv(text);

		if (parsed.rows.length === 0) {
			toast.error("O arquivo não tem linhas de dados.");
			return;
		}

		setFileName(file.name);
		setRows(parsed.rows);
		commit.reset();
		preview.mutate({ rows: parsed.rows });
	}

	const report = preview.data;
	const blocked =
		!report ||
		report.errors.length > 0 ||
		report.unrecognizedHeaders.length > 0;

	const eventOption = (() => {
		if (!rows || !contactFields.data) return null;
		const eventName = rows.find(
			(row) => row.evento_de_origem,
		)?.evento_de_origem;
		if (!eventName) return null;
		const field = contactFields.data.find(
			(entry) => entry.key === "evento_de_origem",
		);
		const option = field?.options.find((entry) => entry.label === eventName);
		return field && option ? { key: field.key, optionId: option.id } : null;
	})();

	const contactsHref = eventOption
		? workspaceUrl(
				`/contacts?fields=${encodeURIComponent(
					JSON.stringify({ [eventOption.key]: [eventOption.optionId] }),
				)}`,
			)
		: workspaceUrl("/contacts");

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Carregar CSV</CardTitle>
					<CardDescription>
						Colunas aceitas: {ACCEPTED_COLUMNS}.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center gap-3">
					<input
						ref={fileInput}
						type="file"
						accept=".csv,text/csv"
						className="hidden"
						onChange={(event) => {
							void pick(event.target.files?.[0]);
							event.target.value = "";
						}}
					/>
					<Button
						type="button"
						variant="outline"
						disabled={preview.isPending || commit.isPending}
						onClick={() => fileInput.current?.click()}
					>
						{preview.isPending ? <Spinner data-icon="inline-start" /> : null}
						Escolher arquivo CSV
					</Button>
					{fileName ? (
						<span className="text-muted-foreground text-sm">{fileName}</span>
					) : null}
				</CardContent>
			</Card>

			{report ? (
				<Card>
					<CardHeader>
						<CardTitle>Relatório (dry-run)</CardTitle>
						<CardDescription>
							Nada foi gravado ainda. Revise antes de confirmar.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
							<div>
								<dt className="text-muted-foreground">Empresas a criar</dt>
								<dd className="font-medium tabular-nums">
									{report.companiesToCreate}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Empresas a atualizar</dt>
								<dd className="font-medium tabular-nums">
									{report.companiesToUpdate}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Contatos a criar</dt>
								<dd className="font-medium tabular-nums">
									{report.contactsToCreate}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Contatos a atualizar</dt>
								<dd className="font-medium tabular-nums">
									{report.contactsToUpdate}
								</dd>
							</div>
						</dl>

						{report.unrecognizedHeaders.length > 0 ? (
							<div className="flex items-start gap-2 text-sm">
								<StatusIndicator
									size="sm"
									tone="error"
									label="Colunas não reconhecidas"
								/>
								<span className="text-muted-foreground">
									{report.unrecognizedHeaders.join(", ")}
								</span>
							</div>
						) : null}

						{report.errors.length > 0 ? (
							<ul className="flex flex-col gap-1 text-sm">
								{report.errors.map((error) => (
									<li key={error.rowIndex} className="text-destructive">
										Linha {error.rowIndex + 2}: {error.message}
									</li>
								))}
							</ul>
						) : null}

						<Button
							type="button"
							disabled={blocked || commit.isPending || !rows}
							onClick={() => rows && commit.mutate({ rows })}
						>
							{commit.isPending ? <Spinner data-icon="inline-start" /> : null}
							Confirmar importação
						</Button>
					</CardContent>
				</Card>
			) : null}

			{commit.data ? (
				<Card>
					<CardHeader>
						<CardTitle>Importação concluída</CardTitle>
						<CardDescription>
							{commit.data.companiesCreated} empresa(s) criada(s),{" "}
							{commit.data.companiesUpdated} atualizada(s) ·{" "}
							{commit.data.contactsCreated} contato(s) criado(s),{" "}
							{commit.data.contactsUpdated} atualizado(s).
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild variant="outline">
							<Link href={contactsHref}>Ver contatos importados</Link>
						</Button>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
