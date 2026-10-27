"use client";

import { CURRENCIES } from "@crm/db/currency";
import { Button } from "@crm/ui/components/button";
import { DatePicker } from "@crm/ui/components/date-picker";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@crm/ui/components/field";
import {
	FormSheet,
	FormSheetContent,
	FormSheetFooter,
	FormSheetForm,
	useFormSheetValidation,
} from "@crm/ui/components/form-sheet";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { type ComponentProps, Suspense, useId, useState } from "react";
import { toast } from "sonner";
import { CompanyPicker } from "@/components/crm/company-picker";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { dealStageLabel, OPEN_STAGES } from "@/lib/deal-stage";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const UNSET = "";

function AddButton(props: ComponentProps<typeof Button>) {
	return (
		<Button {...props}>
			<Icon icon={PlusIcon} data-icon="inline-start" />
			New deal
		</Button>
	);
}

export function CreateDealSheet({ companyId }: { companyId?: string }) {
	return (
		<Suspense fallback={<AddButton disabled />}>
			<CreateDealForm companyId={companyId} />
		</Suspense>
	);
}

function CreateDealForm({ companyId }: { companyId?: string }) {
	const openRecord = useOpenRecord();
	const validation = useFormSheetValidation();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [open, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.create,
		parseAsBoolean.withDefault(false),
	);
	const [name, setName] = useState("");
	const [company, setCompany] = useState(companyId ?? UNSET);
	const [ownerId, setOwnerId] = useState(UNSET);
	const [stage, setStage] = useState<string>("DEMO_BOOKED");
	const [amount, setAmount] = useState("");
	const [currency, setCurrency] = useState("");
	const [closeDate, setCloseDate] = useState("");

	const nameId = useId();
	const amountId = useId();
	const closeDateId = useId();

	const users = useQuery(trpc.users.list.queryOptions());
	const me = useQuery(trpc.users.me.queryOptions());
	const currencies = useQuery(trpc.currency.settings.queryOptions());

	const resolvedOwner = ownerId || me.data?.id || UNSET;
	const workspaceCurrency = currencies.data?.reportingCurrency;
	const resolvedCurrency = currency || workspaceCurrency || "USD";

	const create = useMutation(
		trpc.deals.create.mutationOptions({
			onSuccess: async (deal) => {
				await cache.deal(deal.id);
				toast.success(`${deal.name} added.`);
				await setOpen(null);
				reset();
				openRecord({ kind: "deal", id: deal.id });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const reset = () => {
		validation.reset();
		setName("");
		setCompany(companyId ?? UNSET);
		setOwnerId(UNSET);
		setStage("DEMO_BOOKED");
		setAmount("");
		setCurrency("");
		setCloseDate("");
	};

	return (
		<FormSheet
			dirty={
				name !== "" ||
				company !== (companyId ?? UNSET) ||
				(ownerId !== UNSET && ownerId !== me.data?.id) ||
				stage !== "DEMO_BOOKED" ||
				amount !== "" ||
				(currency !== "" && currency !== (workspaceCurrency || "USD")) ||
				closeDate !== ""
			}
			pending={create.isPending}
			onDiscard={reset}
			open={open}
			onOpenChange={(next) => setOpen(next || null)}
		>
			<SheetTrigger asChild>
				<AddButton />
			</SheetTrigger>
			<FormSheetContent side="right">
				<SheetHeader>
					<SheetTitle>New deal</SheetTitle>
					<SheetDescription>
						Every deal belongs to a company and has someone's name against it.
					</SheetDescription>
				</SheetHeader>

				<FormSheetForm
					noValidate
					onInput={validation.onInput}
					id="create-deal"
					onSubmit={(event) => {
						event.preventDefault();
						const errors: Record<string, string> = {};
						if (company === UNSET)
							errors["create-deal-company"] = "Choose a company.";
						if (resolvedOwner === UNSET)
							errors["create-deal-owner"] = "Choose an owner.";
						if (!validation.validate(event.currentTarget, errors)) return;
						const parsed = Number.parseFloat(amount);
						create.mutate({
							name,
							companyId: company,
							ownerId: resolvedOwner,
							stage: stage as never,
							amountCents: Number.isFinite(parsed)
								? Math.round(parsed * 100)
								: null,
							currency: currency || workspaceCurrency,
							expectedCloseDate: closeDate || null,
						});
					}}
				>
					<Field data-invalid={!!validation.errors[nameId]}>
						<FieldLabel htmlFor={nameId}>Name</FieldLabel>
						<Input
							id={nameId}
							aria-invalid={!!validation.errors[nameId]}
							aria-describedby={
								validation.errors[nameId] ? `${nameId}-error` : undefined
							}
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Stripe Comp AI"
							autoComplete="off"
							pattern=".*\S.*"
							required
						/>
						<FieldError id={`${nameId}-error`}>
							{validation.errors[nameId]}
						</FieldError>
					</Field>

					<Field data-invalid={!!validation.errors["create-deal-company"]}>
						<FieldLabel htmlFor="create-deal-company">Company</FieldLabel>
						<CompanyPicker
							id="create-deal-company"
							aria-invalid={!!validation.errors["create-deal-company"]}
							aria-describedby={
								validation.errors["create-deal-company"]
									? "create-deal-company-error"
									: undefined
							}
							value={company}
							onValueChange={(value) => {
								setCompany(value);
								validation.clearError("create-deal-company");
							}}
						/>
						<FieldError id="create-deal-company-error">
							{validation.errors["create-deal-company"]}
						</FieldError>
					</Field>

					<Field data-invalid={!!validation.errors["create-deal-owner"]}>
						<FieldLabel htmlFor="create-deal-owner">Owner</FieldLabel>
						<Select
							value={resolvedOwner}
							onValueChange={(value) => {
								setOwnerId(value);
								validation.clearError("create-deal-owner");
							}}
						>
							<SelectTrigger
								id="create-deal-owner"
								aria-invalid={!!validation.errors["create-deal-owner"]}
								aria-describedby={
									validation.errors["create-deal-owner"]
										? "create-deal-owner-error"
										: undefined
								}
							>
								<SelectValue placeholder="Choose an owner" />
							</SelectTrigger>
							<SelectContent>
								{(users.data ?? []).map((user) => (
									<SelectItem key={user.id} value={user.id}>
										{user.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldError id="create-deal-owner-error">
							{validation.errors["create-deal-owner"]}
						</FieldError>
					</Field>

					<Field>
						<FieldLabel htmlFor="create-deal-stage">Stage</FieldLabel>
						<Select value={stage} onValueChange={setStage}>
							<SelectTrigger id="create-deal-stage">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{OPEN_STAGES.map((value) => (
									<SelectItem key={value} value={value}>
										{dealStageLabel(value)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldDescription>
							A new deal starts open. Close it from the pipeline once there is
							an outcome to record.
						</FieldDescription>
					</Field>

					<Field data-invalid={!!validation.errors[amountId]}>
						<FieldLabel htmlFor={amountId}>Amount</FieldLabel>
						<div className="flex gap-2">
							<Input
								id={amountId}
								aria-invalid={!!validation.errors[amountId]}
								aria-describedby={
									validation.errors[amountId] ? `${amountId}-error` : undefined
								}
								value={amount}
								onChange={(event) => setAmount(event.target.value)}
								placeholder="24000"
								inputMode="decimal"
								autoComplete="off"
							/>
							<FieldError id={`${amountId}-error`}>
								{validation.errors[amountId]}
							</FieldError>
							<Select value={resolvedCurrency} onValueChange={setCurrency}>
								<SelectTrigger aria-label="Currency" className="w-28 shrink-0">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CURRENCIES.map((entry) => (
										<SelectItem key={entry.code} value={entry.code}>
											{entry.code}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</Field>

					<Field data-invalid={!!validation.errors[closeDateId]}>
						<FieldLabel htmlFor={closeDateId}>Expected close date</FieldLabel>
						<DatePicker
							id={closeDateId}
							value={closeDate}
							onChange={setCloseDate}
							placeholder="No date yet"
						/>
					</Field>
				</FormSheetForm>

				<FormSheetFooter>
					<Button type="submit" form="create-deal" disabled={create.isPending}>
						{create.isPending ? <Spinner data-icon="inline-start" /> : null}
						Add deal
					</Button>
				</FormSheetFooter>
			</FormSheetContent>
		</FormSheet>
	);
}
