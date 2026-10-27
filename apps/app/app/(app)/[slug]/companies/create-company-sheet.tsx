"use client";

import { Button } from "@crm/ui/components/button";
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
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const UNASSIGNED = "unassigned";

function AddButton(props: ComponentProps<typeof Button>) {
	return (
		<Button {...props}>
			<Icon icon={PlusIcon} data-icon="inline-start" />
			New company
		</Button>
	);
}

export function CreateCompanySheet() {
	return (
		<Suspense fallback={<AddButton disabled />}>
			<CreateCompanyForm />
		</Suspense>
	);
}

function CreateCompanyForm() {
	const openRecord = useOpenRecord();
	const validation = useFormSheetValidation();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [open, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.create,
		parseAsBoolean.withDefault(false),
	);
	const [name, setName] = useState("");
	const [domain, setDomain] = useState("");
	const [ownerId, setOwnerId] = useState(UNASSIGNED);

	const nameId = useId();
	const domainId = useId();

	const users = useQuery(trpc.users.list.queryOptions());

	const create = useMutation(
		trpc.companies.create.mutationOptions({
			onSuccess: async (company) => {
				await cache.company(company.id);
				toast.success(`${company.name} added.`);
				await setOpen(null);
				reset();
				openRecord({ kind: "company", id: company.id });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const reset = () => {
		validation.reset();
		setName("");
		setDomain("");
		setOwnerId(UNASSIGNED);
	};

	return (
		<FormSheet
			dirty={name !== "" || domain !== "" || ownerId !== UNASSIGNED}
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
					<SheetTitle>New company</SheetTitle>
					<SheetDescription>
						Give it a name and a domain. The agent fills in the logo,
						description, industry, address and socials.
					</SheetDescription>
				</SheetHeader>

				<FormSheetForm
					noValidate
					onInput={validation.onInput}
					id="create-company"
					onSubmit={(event) => {
						event.preventDefault();
						if (!validation.validate(event.currentTarget)) return;
						create.mutate({
							name,
							domain: domain || undefined,
							ownerId: ownerId === UNASSIGNED ? null : ownerId,
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
							placeholder="Stripe"
							autoComplete="off"
							pattern=".*\S.*"
							required
						/>
						<FieldError id={`${nameId}-error`}>
							{validation.errors[nameId]}
						</FieldError>
					</Field>

					<Field data-invalid={!!validation.errors[domainId]}>
						<FieldLabel htmlFor={domainId}>Domain</FieldLabel>
						<Input
							id={domainId}
							aria-invalid={!!validation.errors[domainId]}
							aria-describedby={
								validation.errors[domainId] ? `${domainId}-error` : undefined
							}
							value={domain}
							onChange={(event) => setDomain(event.target.value)}
							placeholder="stripe.com"
							autoComplete="off"
							inputMode="url"
						/>
						<FieldError id={`${domainId}-error`}>
							{validation.errors[domainId]}
						</FieldError>
						<FieldDescription>
							A full URL works. The CRM uses the host, which has to be unique.
						</FieldDescription>
					</Field>

					<Field>
						<FieldLabel htmlFor="create-company-owner">Owner</FieldLabel>
						<Select value={ownerId} onValueChange={setOwnerId}>
							<SelectTrigger id="create-company-owner">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
								{(users.data ?? []).map((user) => (
									<SelectItem key={user.id} value={user.id}>
										{user.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				</FormSheetForm>

				<FormSheetFooter>
					<Button
						type="submit"
						form="create-company"
						disabled={create.isPending}
					>
						{create.isPending ? <Spinner data-icon="inline-start" /> : null}
						Add company
					</Button>
				</FormSheetFooter>
			</FormSheetContent>
		</FormSheet>
	);
}
