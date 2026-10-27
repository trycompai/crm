"use client";

import { Button } from "@crm/ui/components/button";
import { Field, FieldError, FieldLabel } from "@crm/ui/components/field";
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
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const NONE = "none";

function AddButton(props: ComponentProps<typeof Button>) {
	return (
		<Button {...props}>
			<Icon icon={PlusIcon} data-icon="inline-start" />
			New contact
		</Button>
	);
}

export function CreateContactSheet({ companyId }: { companyId?: string }) {
	return (
		<Suspense fallback={<AddButton disabled />}>
			<CreateContactForm companyId={companyId} />
		</Suspense>
	);
}

function CreateContactForm({ companyId }: { companyId?: string }) {
	const openRecord = useOpenRecord();
	const validation = useFormSheetValidation();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [open, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.create,
		parseAsBoolean.withDefault(false),
	);
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [title, setTitle] = useState("");
	const [company, setCompany] = useState(companyId ?? NONE);
	const [ownerId, setOwnerId] = useState(NONE);

	const firstNameId = useId();
	const lastNameId = useId();
	const emailId = useId();
	const titleId = useId();

	const users = useQuery(trpc.users.list.queryOptions());

	const create = useMutation(
		trpc.contacts.create.mutationOptions({
			onSuccess: async (contact) => {
				await cache.contact(contact.id);
				toast.success(
					`${[contact.firstName, contact.lastName].filter(Boolean).join(" ")} added.`,
				);
				await setOpen(null);
				reset();
				openRecord({ kind: "contact", id: contact.id });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const reset = () => {
		validation.reset();
		setFirstName("");
		setLastName("");
		setEmail("");
		setTitle("");
		setCompany(companyId ?? NONE);
		setOwnerId(NONE);
	};

	return (
		<FormSheet
			dirty={
				firstName !== "" ||
				lastName !== "" ||
				email !== "" ||
				title !== "" ||
				company !== (companyId ?? NONE) ||
				ownerId !== NONE
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
					<SheetTitle>New contact</SheetTitle>
					<SheetDescription>
						Email addresses are unique, so importing the same person twice
						updates them rather than duplicating them.
					</SheetDescription>
				</SheetHeader>

				<FormSheetForm
					noValidate
					onInput={validation.onInput}
					id="create-contact"
					onSubmit={(event) => {
						event.preventDefault();
						if (!validation.validate(event.currentTarget)) return;
						create.mutate({
							firstName,
							lastName: lastName || undefined,
							email: email || undefined,
							title: title || undefined,
							companyId: company === NONE ? null : company,
							ownerId: ownerId === NONE ? null : ownerId,
						});
					}}
				>
					<Field data-invalid={!!validation.errors[firstNameId]}>
						<FieldLabel htmlFor={firstNameId}>First name</FieldLabel>
						<Input
							id={firstNameId}
							aria-invalid={!!validation.errors[firstNameId]}
							aria-describedby={
								validation.errors[firstNameId]
									? `${firstNameId}-error`
									: undefined
							}
							value={firstName}
							onChange={(event) => setFirstName(event.target.value)}
							autoComplete="off"
							pattern=".*\S.*"
							required
						/>
						<FieldError id={`${firstNameId}-error`}>
							{validation.errors[firstNameId]}
						</FieldError>
					</Field>

					<Field data-invalid={!!validation.errors[lastNameId]}>
						<FieldLabel htmlFor={lastNameId}>Last name</FieldLabel>
						<Input
							id={lastNameId}
							aria-invalid={!!validation.errors[lastNameId]}
							aria-describedby={
								validation.errors[lastNameId]
									? `${lastNameId}-error`
									: undefined
							}
							value={lastName}
							onChange={(event) => setLastName(event.target.value)}
							autoComplete="off"
						/>
						<FieldError id={`${lastNameId}-error`}>
							{validation.errors[lastNameId]}
						</FieldError>
					</Field>

					<Field data-invalid={!!validation.errors[emailId]}>
						<FieldLabel htmlFor={emailId}>Email</FieldLabel>
						<Input
							id={emailId}
							aria-invalid={!!validation.errors[emailId]}
							aria-describedby={
								validation.errors[emailId] ? `${emailId}-error` : undefined
							}
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							autoComplete="off"
						/>
						<FieldError id={`${emailId}-error`}>
							{validation.errors[emailId]}
						</FieldError>
					</Field>

					<Field data-invalid={!!validation.errors[titleId]}>
						<FieldLabel htmlFor={titleId}>Title</FieldLabel>
						<Input
							id={titleId}
							aria-invalid={!!validation.errors[titleId]}
							aria-describedby={
								validation.errors[titleId] ? `${titleId}-error` : undefined
							}
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Head of Security"
							autoComplete="off"
						/>
						<FieldError id={`${titleId}-error`}>
							{validation.errors[titleId]}
						</FieldError>
					</Field>

					<Field>
						<FieldLabel htmlFor="create-contact-company">Company</FieldLabel>
						<CompanyPicker
							id="create-contact-company"
							value={company}
							onValueChange={setCompany}
							none={{ value: NONE, label: "No company" }}
						/>
					</Field>

					<Field>
						<FieldLabel htmlFor="create-contact-owner">Owner</FieldLabel>
						<Select value={ownerId} onValueChange={setOwnerId}>
							<SelectTrigger id="create-contact-owner">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>Unassigned</SelectItem>
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
						form="create-contact"
						disabled={create.isPending}
					>
						{create.isPending ? <Spinner data-icon="inline-start" /> : null}
						Add contact
					</Button>
				</FormSheetFooter>
			</FormSheetContent>
		</FormSheet>
	);
}
