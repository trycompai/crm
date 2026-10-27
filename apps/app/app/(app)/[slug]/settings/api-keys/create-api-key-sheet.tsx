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
import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { type ComponentProps, Suspense, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CreatedApiKeyDialog } from "./created-api-key-dialog";

const FORM = "create-api-key";

const EXPIRATION_OPTIONS = [
	{ value: "30", label: "30 days" },
	{ value: "90", label: "90 days" },
	{ value: "365", label: "1 year" },
	{ value: "never", label: "No expiration" },
] as const;

type ExpirationValue = (typeof EXPIRATION_OPTIONS)[number]["value"];

type CreatedApiKey = RouterOutputs["apiKeys"]["create"];

function NewApiKeyButton(props: ComponentProps<typeof Button>) {
	return (
		<Button {...props}>
			<Icon icon={PlusIcon} data-icon="inline-start" />
			New API key
		</Button>
	);
}

export function CreateApiKeySheet() {
	return (
		<Suspense fallback={<NewApiKeyButton disabled />}>
			<CreateApiKeyForm />
		</Suspense>
	);
}

function CreateApiKeyForm() {
	const validation = useFormSheetValidation();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const nameId = useId();
	const expirationId = useId();
	const triggerRef = useRef<HTMLButtonElement>(null);

	const [open, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.create,
		parseAsBoolean.withDefault(false),
	);
	const [name, setName] = useState("");
	const [expiration, setExpiration] = useState<ExpirationValue>("90");
	const [created, setCreated] = useState<CreatedApiKey | null>(null);

	const create = useMutation(
		trpc.apiKeys.create.mutationOptions({
			onSuccess: async (apiKey) => {
				await cache.apiKeys();
				await setOpen(null);
				reset();
				setCreated(apiKey);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const reset = () => {
		validation.reset();
		setName("");
		setExpiration("90");
	};

	return (
		<>
			<FormSheet
				dirty={name !== "" || expiration !== "90"}
				pending={create.isPending}
				onDiscard={reset}
				open={open}
				onOpenChange={(next) => setOpen(next || null)}
			>
				<SheetTrigger asChild>
					<NewApiKeyButton ref={triggerRef} />
				</SheetTrigger>

				<FormSheetContent side="right">
					<SheetHeader>
						<SheetTitle>New API key</SheetTitle>
						<SheetDescription>
							Acts as you. Anything it can read or change is exactly what you
							can.
						</SheetDescription>
					</SheetHeader>

					<FormSheetForm
						noValidate
						onInput={validation.onInput}
						id={FORM}
						onSubmit={(event) => {
							event.preventDefault();
							if (!validation.validate(event.currentTarget)) return;
							create.mutate({
								name: name.trim(),
								expiresInDays:
									expiration === "never" ? null : Number(expiration),
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
								placeholder="CI pipeline"
								maxLength={64}
								autoComplete="off"
								autoCapitalize="off"
								autoCorrect="off"
								spellCheck={false}
								pattern=".*\S.*"
								required
							/>
							<FieldError id={`${nameId}-error`}>
								{validation.errors[nameId]}
							</FieldError>
							<FieldDescription>
								Something you will recognise later, like where it runs.
							</FieldDescription>
						</Field>

						<Field data-invalid={!!validation.errors[expirationId]}>
							<FieldLabel htmlFor={expirationId}>Expires</FieldLabel>
							<Select
								value={expiration}
								onValueChange={(value) =>
									setExpiration(value as ExpirationValue)
								}
							>
								<SelectTrigger id={expirationId} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{EXPIRATION_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					</FormSheetForm>

					<FormSheetFooter>
						<Button type="submit" form={FORM} disabled={create.isPending}>
							{create.isPending ? <Spinner data-icon="inline-start" /> : null}
							Create key
						</Button>
					</FormSheetFooter>
				</FormSheetContent>
			</FormSheet>

			<CreatedApiKeyDialog
				apiKey={created}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					triggerRef.current?.focus();
				}}
				onOpenChange={(next) => {
					if (!next) setCreated(null);
				}}
			/>
		</>
	);
}
