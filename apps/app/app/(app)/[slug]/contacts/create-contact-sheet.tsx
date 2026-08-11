"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
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
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsBoolean, useQueryState } from "nuqs";
import { type ComponentProps, Suspense, useId, useState } from "react";
import { toast } from "sonner";
import { CompanyPicker } from "@/components/crm/company-picker";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const NONE = "none";

function AddButton(props: ComponentProps<typeof Button>) {
	return (
		<Button {...props}>
			<Icon icon={Add} data-icon="inline-start" />
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
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [open, setOpen] = useQueryState(
		"new",
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
				setFirstName("");
				setLastName("");
				setEmail("");
				setTitle("");
				openRecord({ kind: "contact", id: contact.id });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Sheet open={open} onOpenChange={(next) => setOpen(next || null)}>
			<SheetTrigger asChild>
				<AddButton />
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>New contact</SheetTitle>
					<SheetDescription>
						Email addresses are unique, so importing the same person twice
						updates them rather than duplicating them.
					</SheetDescription>
				</SheetHeader>

				<form
					id="create-contact"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
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
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={firstNameId}>First name</FieldLabel>
							<Input
								id={firstNameId}
								value={firstName}
								onChange={(event) => setFirstName(event.target.value)}
								autoComplete="off"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={lastNameId}>Last name</FieldLabel>
							<Input
								id={lastNameId}
								value={lastName}
								onChange={(event) => setLastName(event.target.value)}
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={emailId}>Email</FieldLabel>
							<Input
								id={emailId}
								type="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={titleId}>Title</FieldLabel>
							<Input
								id={titleId}
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								placeholder="Head of Security"
								autoComplete="off"
							/>
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
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form="create-contact"
						disabled={create.isPending || firstName.trim() === ""}
					>
						{create.isPending ? <Spinner /> : null}
						Add contact
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancel</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
