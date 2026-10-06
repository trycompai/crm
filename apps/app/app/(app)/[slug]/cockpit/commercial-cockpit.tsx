"use client";

import Phone from "@carbon/icons-react/es/Phone";
import Task from "@carbon/icons-react/es/Task";
import type { DealStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardPanel,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { LocalDay } from "@/components/local-date-time";
import { dealStageLabel } from "@/lib/deal-stage";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type TaskEntry = RouterOutputs["activities"]["myTasks"][number];
type DealRow = RouterOutputs["deals"]["list"]["rows"][number];

type Bucket = "overdue" | "today" | "upcoming" | "no-date";

const BUCKETS: Array<{ id: Bucket; label: string; description: string }> = [
	{
		id: "overdue",
		label: "Atrasados",
		description: "Ações que já passaram do prazo",
	},
	{ id: "today", label: "Hoje", description: "Ações para executar agora" },
	{ id: "upcoming", label: "Próximos", description: "Ações dos próximos dias" },
	{
		id: "no-date",
		label: "Sem data",
		description: "Tarefas que precisam de planejamento",
	},
];

function dayKey(value: Date): string {
	return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

function bucketFor(task: TaskEntry): Bucket {
	if (!task.dueAt) return "no-date";
	const due = new Date(task.dueAt);
	const today = new Date();
	if (due < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
		return "overdue";
	}
	if (dayKey(due) === dayKey(today)) return "today";
	return "upcoming";
}

function taskLabel(task: TaskEntry): string {
	return task.subject ?? task.body ?? "Follow-up comercial";
}

function whatsappUrl(task: TaskEntry): string | null {
	const phone = task.contact?.phone?.replace(/\D/g, "");
	if (!phone) return null;
	const text =
		task.body ||
		`Olá${task.contact?.firstName ? `, ${task.contact.firstName}` : ""}! Passando para retomar nossa conversa. Podemos avançar por aqui?`;
	return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function TaskRow({ task }: { task: TaskEntry }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();
	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onSuccess: () => cache.activity(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const whatsapp = whatsappUrl(task);
	const isCall =
		(task.subject?.toLowerCase().includes("ligação") ||
			task.subject?.toLowerCase().includes("ligar")) ??
		false;
	const isPreview = task.subject?.toLowerCase().includes("prévia") ?? false;
	const cleanPhone = task.contact?.phone?.replace(/\D/g, "");
	const record = task.deal
		? { kind: "deal" as const, id: task.deal.id }
		: task.contact
			? { kind: "contact" as const, id: task.contact.id }
			: task.company
				? { kind: "company" as const, id: task.company.id }
				: null;

	return (
		<div className="flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
			<div className="min-w-0 flex-1">
				<button
					type="button"
					className="block max-w-full truncate text-left font-medium hover:underline text-base"
					onClick={() => record && openRecord(record)}
				>
					{taskLabel(task)}
				</button>
				<div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground text-sm">
					{task.company ? (
						<span className="font-semibold text-foreground/80">
							{task.company.name}
						</span>
					) : null}
					{task.contact ? (
						<span>
							• {task.contact.firstName} {task.contact.lastName ?? ""}{" "}
							{task.contact.phone ? `(${task.contact.phone})` : ""}
						</span>
					) : null}
					{task.dueAt ? (
						<span>
							• Prazo: <LocalDay date={task.dueAt} />
						</span>
					) : (
						<span>• Definir data</span>
					)}
				</div>
				{task.body && task.body !== task.subject && (
					<div className="mt-2 rounded-md bg-muted/70 p-2.5 text-xs text-foreground/90 border-l-2 border-primary whitespace-pre-wrap leading-relaxed">
						<span className="font-semibold text-primary block mb-1">
							{isCall
								? "Roteiro de ligação:"
								: isPreview
									? "Brief da prévia:"
									: "Mensagem IA (WhatsApp):"}
						</span>
						{task.body}
					</div>
				)}
			</div>
			<div className="flex shrink-0 flex-wrap gap-2 sm:self-start sm:pt-1">
				{isCall && cleanPhone ? (
					<Button
						asChild
						size="sm"
						variant="default"
						className="bg-amber-600 hover:bg-amber-500 text-white"
					>
						<a href={`tel:${cleanPhone}`}>
							<Icon icon={Phone} data-icon="inline-start" />
							Ligar
						</a>
					</Button>
				) : whatsapp ? (
					<Button
						asChild
						size="sm"
						variant="default"
						className="bg-emerald-600 hover:bg-emerald-500 text-white"
					>
						<a href={whatsapp} target="_blank" rel="noreferrer">
							<Icon icon={Phone} data-icon="inline-start" />
							WhatsApp
						</a>
					</Button>
				) : null}
				<Button
					size="sm"
					variant="outline"
					disabled={complete.isPending}
					onClick={() => complete.mutate({ id: task.id, completed: true })}
				>
					Concluir
				</Button>
			</div>
		</div>
	);
}

const KANBAN_STAGES: DealStage[] = [
	"DEMO_BOOKED",
	"QUALIFIED_TO_BUY",
	"DECISION_MAKER_BOUGHT_IN",
	"CONTRACT_SENT",
	"CLOSED_WON",
	"CLOSED_LOST",
	"UNQUALIFIED_TO_BUY",
];

function Kanban({ rows }: { rows: DealRow[] }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();
	const workspaceUrl = useWorkspaceUrl();
	const [pendingDealId, setPendingDealId] = useState<string | null>(null);
	const requestPreview = useMutation(
		trpc.activities.create.mutationOptions({
			onSuccess: () => {
				setPendingDealId(null);
				cache.activity();
				toast.success("Solicitação registrada nas ações comerciais.");
			},
			onError: (error) => {
				setPendingDealId(null);
				toast.error(error.message);
			},
		}),
	);
	const createPreviewTask = (deal: DealRow) => {
		setPendingDealId(deal.id);
		requestPreview.mutate({
			type: "TASK",
			subject: `Produzir prévia do site: ${deal.company.name}`,
			body: `Criar uma prévia visual para ${deal.company.name} com base no contexto deste Deal. Adicione o link da prévia ao registro quando estiver pronta.`,
			dealId: deal.id,
		});
	};
	if (rows.length === 0) {
		return (
			<div className="flex flex-col items-center rounded-lg border border-dashed p-8 text-center">
				<p className="font-medium">Nenhuma oportunidade no Kanban.</p>
				<p className="mt-1 text-muted-foreground text-sm">
					Crie um Deal para acompanhar a oportunidade por estágio.
				</p>
				<Button asChild size="sm" className="mt-4">
					<Link href={`${workspaceUrl("/deals")}?new=true`}>
						Criar primeiro Deal
					</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="flex gap-4 overflow-x-auto pb-2">
			{KANBAN_STAGES.map((stage) => {
				const deals = rows.filter((deal) => deal.stage === stage);
				return (
					<div
						key={stage}
						className="w-72 shrink-0 rounded-lg border bg-muted/20 p-3"
					>
						<div className="mb-3 flex items-center justify-between gap-2">
							<h3 className="font-medium text-sm">{dealStageLabel(stage)}</h3>
							<span className="text-muted-foreground text-sm tabular-nums">
								{deals.length}
							</span>
						</div>
						<div className="flex flex-col gap-2">
							{deals.map((deal) => (
								<article
									key={deal.id}
									className="rounded-md border bg-background p-3"
								>
									<button
										type="button"
										className="block w-full truncate text-left font-medium hover:underline"
										onClick={() => openRecord({ kind: "deal", id: deal.id })}
									>
										{deal.name}
									</button>
									<div className="mt-1 truncate text-muted-foreground text-sm">
										{deal.company.name}
									</div>
									<div className="mt-2 flex flex-wrap gap-1 text-muted-foreground text-xs">
										{deal.fields.linha_de_negocio ? (
											<span className="rounded-sm border px-1.5 py-0.5">
												{String(deal.fields.linha_de_negocio)}
											</span>
										) : null}
										{deal.fields.produto ? (
											<span className="rounded-sm border px-1.5 py-0.5">
												{String(deal.fields.produto)}
											</span>
										) : null}
									</div>
									<Button
										size="sm"
										variant="outline"
										className="mt-3 w-full"
										disabled={requestPreview.isPending}
										aria-busy={pendingDealId === deal.id}
										onClick={() => createPreviewTask(deal)}
									>
										Pedir prévia
									</Button>
								</article>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

export function CommercialCockpit() {
	const trpc = useTRPC();
	const [view, setView] = useState<"actions" | "kanban">("actions");
	const tasks = useQuery({
		...trpc.activities.myTasks.queryOptions({ window: "all", limit: 100 }),
		refetchInterval: 60_000,
	});
	const deals = useQuery(
		trpc.deals.list.queryOptions({
			q: "",
			sort: "createdAt",
			dir: "desc",
			page: 1,
			pageSize: 100,
			status: "all",
			owner: [],
			stage: [],
			closing: [],
			fields: {},
			archived: false,
		}),
	);
	const grouped = useMemo(() => {
		const result = new Map<Bucket, TaskEntry[]>(
			BUCKETS.map(({ id }) => [id, []]),
		);
		for (const task of tasks.data ?? []) {
			result.get(bucketFor(task))?.push(task);
		}
		return result;
	}, [tasks.data]);

	return (
		<Tabs
			value={view}
			onValueChange={(value) => setView(value as "actions" | "kanban")}
		>
			<TabsList variant="line" className="w-full justify-start">
				<TabsTrigger value="actions">Ações comerciais</TabsTrigger>
				<TabsTrigger value="kanban">Kanban</TabsTrigger>
			</TabsList>
			<TabsContent value="actions" className="mt-6">
				<div className="grid gap-6 @3xl/page-content:grid-cols-2">
					{BUCKETS.map((bucket) => {
						const rows = grouped.get(bucket.id) ?? [];
						return (
							<Card key={bucket.id} className="min-w-0">
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Icon icon={Task} />
										{bucket.label}
									</CardTitle>
									<CardDescription>{bucket.description}</CardDescription>
								</CardHeader>
								<CardPanel>
									{rows.length === 0 ? (
										<p className="py-4 text-muted-foreground text-sm">
											Nenhum follow-up nesta fila.
										</p>
									) : (
										rows.map((task) => <TaskRow key={task.id} task={task} />)
									)}
								</CardPanel>
							</Card>
						);
					})}
				</div>
			</TabsContent>
			<TabsContent value="kanban" className="mt-6">
				<Kanban rows={deals.data?.rows ?? []} />
			</TabsContent>
		</Tabs>
	);
}
