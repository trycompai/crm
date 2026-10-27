"use client";

import { CURRENCIES, isCurrencyCode } from "@crm/db/currency";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { useFormSheetValidation } from "@crm/ui/components/form-sheet";
import { Input } from "@crm/ui/components/input";
import { OptionLabel } from "@crm/ui/components/option-label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SettingsCard, SettingsColumn } from "@crm/ui/components/settings-card";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { formatCount } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";

const RATE_COLUMNS: SimpleTableColumn[] = [
	{ id: "currency", header: "Currency" },
	{ id: "rate", header: "Rate", width: "w-32", align: "right" },
	{ id: "source", header: "Source", width: "w-28" },
	{ id: "asOf", header: "As of", width: "w-24", align: "right" },
	{ id: "actions", srLabel: "Actions", width: "w-20" },
];

const USAGE_COLUMNS: SimpleTableColumn[] = [
	{ id: "currency", header: "Currency" },
	{ id: "deals", header: "Deals", width: "w-20", align: "right" },
	{ id: "convertible", header: "Convertible", width: "w-32", align: "right" },
];

export function CurrencySettings() {
	const validation = useFormSheetValidation();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const baseId = useId();
	const rateCurrencyId = useId();
	const rateValueId = useId();

	const [draftCurrency, setDraftCurrency] = useState("");
	const [draftRate, setDraftRate] = useState("");

	const settings = useQuery(trpc.currency.settings.queryOptions());

	const invalidate = () => cache.currency();

	const setBase = useMutation(
		trpc.currency.setReportingCurrency.mutationOptions({
			onSuccess: async (next) => {
				await invalidate();
				toast.success(
					`Every total is now reported in ${next.reportingCurrency}.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const setRate = useMutation(
		trpc.currency.setManualRate.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				validation.reset();
				setDraftCurrency("");
				setDraftRate("");
				toast.success("Rate saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const removeRate = useMutation(
		trpc.currency.removeManualRate.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Rate removed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const refresh = useMutation(
		trpc.currency.refreshRates.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Rates refreshed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!settings.data) return null;

	const {
		reportingCurrency,
		refreshedAt,
		rates,
		inUse,
		unconverted,
		canManage,
	} = settings.data;

	const busy =
		!canManage ||
		setBase.isPending ||
		setRate.isPending ||
		removeRate.isPending ||
		refresh.isPending;

	return (
		<SettingsColumn>
			<SettingsCard
				title="Reporting currency"
				description="Every total, chart and average in the CRM is expressed in this currency. Each deal keeps the currency it was sold in."
				hint={
					canManage
						? "Changes save as you make them. Every deal is re-converted at today's rates, so figures already reported move."
						: "Only an owner or an admin can change how money is reported."
				}
				control="compact"
			>
				<Field>
					<FieldLabel htmlFor={baseId}>Report totals in</FieldLabel>
					<Select
						value={reportingCurrency}
						disabled={busy}
						onValueChange={(currency) => setBase.mutate({ currency })}
					>
						<SelectTrigger id={baseId} className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CURRENCIES.map((entry) => (
								<SelectItem key={entry.code} value={entry.code}>
									<OptionLabel label={entry.code} detail={entry.name} />
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
			</SettingsCard>

			<SettingsCard
				title="Exchange rates"
				description={`How many ${reportingCurrency} one unit of each currency buys.`}
				hint={
					refreshedAt ? (
						<>
							Fetched daily from open.er-api.com. Last fetched{" "}
							<LocalRelativeTime date={refreshedAt} />.
						</>
					) : (
						"Fetched daily from open.er-api.com."
					)
				}
				action={
					<Button
						variant="outline"
						size="sm"
						disabled={busy}
						onClick={() => refresh.mutate()}
					>
						{refresh.isPending ? <Spinner data-icon="inline-start" /> : null}
						Refresh rates
					</Button>
				}
				control={rates.length === 0 ? "full" : "table"}
			>
				{rates.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No rates yet. Refresh to fetch them, or enter one by hand.
					</p>
				) : (
					<SimpleTable columns={RATE_COLUMNS}>
						{rates.map((rate) => (
							<SimpleTableRow key={rate.currency}>
								<TableCell className={CELL}>
									<span className="flex min-w-0 flex-col">
										<span className="font-medium">{rate.currency}</span>
										{rate.name ? (
											<span className="truncate text-muted-foreground">
												{rate.name}
											</span>
										) : null}
									</span>
								</TableCell>
								<TableCell className={`${CELL} text-right tabular-nums`}>
									{rate.rate}
								</TableCell>
								<TableCell className={CELL}>
									<StatusIndicator
										size="sm"
										tone={rate.source === "MANUAL" ? "warning" : "success"}
										label={rate.source === "MANUAL" ? "By hand" : "Fetched"}
									/>
								</TableCell>
								<TableCell
									className={`${CELL} text-right text-muted-foreground`}
								>
									<LocalRelativeTime date={rate.asOf} />
								</TableCell>
								<TableCell className={`${CELL} text-right`}>
									{rate.source === "MANUAL" ? (
										<Button
											variant="ghost"
											size="sm"
											disabled={busy}
											onClick={() =>
												removeRate.mutate({ currency: rate.currency })
											}
										>
											Remove
										</Button>
									) : null}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</SettingsCard>

			<SettingsCard
				title="Rate by hand"
				description="A rate you enter here wins over the fetched one."
				hint="Use a number greater than zero."
				control="compact"
				action={
					<Button type="submit" form="manual-rate" size="sm" disabled={busy}>
						{setRate.isPending ? <Spinner data-icon="inline-start" /> : null}
						Save rate
					</Button>
				}
			>
				<form
					id="manual-rate"
					noValidate
					onInput={validation.onInput}
					onSubmit={(event) => {
						event.preventDefault();
						if (busy) return;
						const rate = Number.parseFloat(draftRate);
						const errors: Record<string, string> = {};
						if (!isCurrencyCode(draftCurrency))
							errors[rateCurrencyId] = "Choose a currency.";
						else if (draftCurrency === reportingCurrency)
							errors[rateCurrencyId] =
								`${reportingCurrency} is the reporting currency. Its rate is always 1.`;
						if (!Number.isFinite(rate) || rate <= 0)
							errors[rateValueId] =
								"A rate has to be a number greater than zero.";
						if (!validation.validate(event.currentTarget, errors)) return;
						setRate.mutate({ currency: draftCurrency, rate });
					}}
				>
					<FieldGroup>
						<Field data-invalid={!!validation.errors[rateCurrencyId]}>
							<FieldLabel htmlFor={rateCurrencyId}>Currency</FieldLabel>
							<Select
								value={draftCurrency}
								disabled={busy}
								onValueChange={(currency) => {
									setDraftCurrency(currency);
									validation.clearError(rateCurrencyId);
								}}
							>
								<SelectTrigger
									id={rateCurrencyId}
									className="w-full"
									aria-invalid={!!validation.errors[rateCurrencyId]}
									aria-describedby={
										validation.errors[rateCurrencyId]
											? `${rateCurrencyId}-error`
											: undefined
									}
								>
									<SelectValue placeholder="Pick one" />
								</SelectTrigger>
								<SelectContent>
									{CURRENCIES.filter(
										(entry) => entry.code !== reportingCurrency,
									).map((entry) => (
										<SelectItem key={entry.code} value={entry.code}>
											<OptionLabel label={entry.code} detail={entry.name} />
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldError id={`${rateCurrencyId}-error`}>
								{validation.errors[rateCurrencyId]}
							</FieldError>
						</Field>

						<Field data-invalid={!!validation.errors[rateValueId]}>
							<FieldLabel htmlFor={rateValueId}>
								1 {draftCurrency || "unit"} = ? {reportingCurrency}
							</FieldLabel>
							<Input
								id={rateValueId}
								aria-invalid={!!validation.errors[rateValueId]}
								aria-describedby={
									validation.errors[rateValueId]
										? `${rateValueId}-error`
										: undefined
								}
								required
								value={draftRate}
								inputMode="decimal"
								placeholder="1.09"
								disabled={busy}
								onChange={(event) => setDraftRate(event.target.value)}
							/>
							<FieldError id={`${rateValueId}-error`}>
								{validation.errors[rateValueId]}
							</FieldError>
						</Field>
					</FieldGroup>
				</form>
			</SettingsCard>

			<SettingsCard
				title="Currencies in use"
				description={
					unconverted.count === 0
						? "Every deal with an amount can be converted into the reporting currency."
						: `${formatCount(unconverted.count, "deal")} cannot be converted, so ${unconverted.count === 1 ? "it is" : "they are"} left out of every total.`
				}
				control={inUse.length === 0 ? "full" : "table"}
			>
				{inUse.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No deals have an amount yet.
					</p>
				) : (
					<SimpleTable columns={USAGE_COLUMNS}>
						{inUse.map((row) => (
							<SimpleTableRow key={row.currency}>
								<TableCell className={CELL}>
									<span className="flex min-w-0 flex-col">
										<span className="flex items-center gap-2">
											<span className="font-medium">{row.currency}</span>
											{row.currency === reportingCurrency ? (
												<Badge variant="secondary">Reporting currency</Badge>
											) : null}
										</span>
										{row.name ? (
											<span className="truncate text-muted-foreground">
												{row.name}
											</span>
										) : null}
									</span>
								</TableCell>
								<TableCell className={`${CELL} text-right tabular-nums`}>
									{row.deals}
								</TableCell>
								<TableCell className={`${CELL} text-right`}>
									{row.convertible ? (
										<StatusIndicator size="sm" tone="success" label="Yes" />
									) : (
										<StatusIndicator size="sm" tone="error" label="No rate" />
									)}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</SettingsCard>
		</SettingsColumn>
	);
}
