"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import Image from "@carbon/icons-react/es/Image";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@crm/ui/components/command";
import { Icon } from "@crm/ui/components/icon";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

type CatalogModel = {
	id: string;
	name: string;
	provider: string;
	contextWindowTokens: number;
	pricing: { input: number; output: number } | null;
	vision: boolean;
};

const FOLLOW_DEFAULT = "__default__";

function perMillion(rate: number): string {
	const dollars = rate * 1_000_000;
	return `$${dollars.toFixed(2).replace(/\.?0+$/, "")}`;
}

function priceHint(model: CatalogModel): string | null {
	if (!model.pricing) return null;
	return `${perMillion(model.pricing.input)} in · ${perMillion(model.pricing.output)} out per 1M`;
}

function contextHint(tokens: number): string {
	return tokens >= 1_000_000
		? `${Math.round(tokens / 1_000_000)}M context`
		: `${Math.round(tokens / 1_000)}K context`;
}

function byProvider(models: CatalogModel[]): [string, CatalogModel[]][] {
	const groups = new Map<string, CatalogModel[]>();

	for (const model of models) {
		const list = groups.get(model.provider) ?? [];
		list.push(model);
		groups.set(model.provider, list);
	}

	return [...groups];
}

export function AgentModel() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [open, setOpen] = useState(false);

	const settings = useQuery(trpc.settings.agentModel.queryOptions());
	const catalog = useQuery(trpc.settings.modelCatalog.queryOptions());

	const save = useMutation(
		trpc.settings.setAgentModel.mutationOptions({
			onSuccess: async () => {
				await cache.settings();
				toast.success("The agent will use this model from its next session.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!settings.data) return null;

	const { selectedId, effectiveId, defaultId, effective } = settings.data;
	const models = catalog.data?.models ?? [];
	const unavailable = catalog.data !== undefined && !catalog.data.available;

	const defaultModel = models.find((model) => model.id === defaultId);
	const current = selectedId ?? FOLLOW_DEFAULT;

	const effectiveName = effective?.name ?? effectiveId;

	const currentLabel = selectedId
		? effectiveName
		: `Default — ${effectiveName}`;

	const choose = (id: string) => {
		setOpen(false);
		if (id === current) return;
		save.mutate({ modelId: id === FOLLOW_DEFAULT ? null : id });
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Research agent</CardTitle>
				<CardDescription>
					The model the agent thinks with, routed through the Vercel AI Gateway.
				</CardDescription>
			</CardHeader>

			<CardContent>
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							role="combobox"
							aria-expanded={open}
							aria-label="Model"
							disabled={save.isPending || catalog.isPending || unavailable}
						>
							{currentLabel}
							<Icon icon={ChevronDown} data-icon="inline-end" />
						</Button>
					</PopoverTrigger>

					<PopoverContent align="start" size="fit" className="w-96">
						<Command>
							<CommandInput placeholder="Search models…" />
							<CommandList>
								<CommandEmpty>No model matches that.</CommandEmpty>

								<CommandGroup>
									<CommandItem
										value={`default ${defaultId}`}
										data-checked={current === FOLLOW_DEFAULT}
										onSelect={() => choose(FOLLOW_DEFAULT)}
									>
										Default — {defaultModel?.name ?? defaultId}
									</CommandItem>
								</CommandGroup>

								{byProvider(models).map(([provider, group]) => (
									<CommandGroup key={provider} heading={provider}>
										{group.map((model) => {
											const price = priceHint(model);

											return (
												<CommandItem
													key={model.id}
													value={`${model.name} ${model.provider} ${model.id}`}
													data-checked={current === model.id}
													onSelect={() => choose(model.id)}
												>
													<span>{model.name}</span>
													{model.vision ? (
														<Icon
															icon={Image}
															className="size-3.5 text-muted-foreground"
															aria-label="Reads images"
														/>
													) : null}
													<span className="ml-auto text-muted-foreground text-xs">
														{price ?? contextHint(model.contextWindowTokens)}
													</span>
												</CommandItem>
											);
										})}
									</CommandGroup>
								))}
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>

				<p className="text-muted-foreground text-xs">
					{unavailable
						? `Could not reach the AI Gateway to list models. The agent is still running ${effectiveId}.`
						: effective
							? `${effectiveId} · ${contextHint(effective.contextWindowTokens)}${
									priceHint(effective) ? ` · ${priceHint(effective)}` : ""
								}`
							: effectiveId}
				</p>
			</CardContent>
		</Card>
	);
}
