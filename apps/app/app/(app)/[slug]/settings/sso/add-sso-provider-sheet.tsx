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
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
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
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { CopyValue } from "../copy-value";

const FORM = "add-sso-provider";

const EMPTY = {
	providerId: "",
	issuer: "",
	domain: "",
	clientId: "",
	clientSecret: "",
};

function AddButton(props: ComponentProps<typeof Button>) {
	return (
		<Button {...props}>
			<Icon icon={PlusIcon} data-icon="inline-start" />
			Add provider
		</Button>
	);
}

export function AddSsoProviderSheet() {
	return (
		<Suspense fallback={<AddButton disabled />}>
			<AddSsoProviderForm />
		</Suspense>
	);
}

function AddSsoProviderForm() {
	const validation = useFormSheetValidation();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const settings = useQuery(trpc.sso.settings.queryOptions());

	const providerIdId = useId();
	const issuerId = useId();
	const domainId = useId();
	const clientIdId = useId();
	const clientSecretId = useId();
	const redirectId = useId();

	const [open, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.create,
		parseAsBoolean.withDefault(false),
	);
	const [values, setValues] = useState(EMPTY);

	const register = useMutation(
		trpc.sso.register.mutationOptions({
			onSuccess: async (provider) => {
				await cache.sso();
				toast.success(`${provider.name} saved.`);
				await setOpen(null);
				reset();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const edit = (patch: Partial<typeof values>) =>
		setValues({ ...values, ...patch });

	const providerId = values.providerId.trim().toLowerCase();

	const callbackURL = `${settings.data?.callbackBase ?? ""}/${
		providerId || "…"
	}`;

	const reset = () => {
		validation.reset();
		setValues(EMPTY);
	};

	return (
		<FormSheet
			dirty={Object.values(values).some((value) => value !== "")}
			pending={register.isPending}
			onDiscard={reset}
			open={open}
			onOpenChange={(next) => setOpen(next || null)}
		>
			<SheetTrigger asChild>
				<AddButton disabled={!settings.data?.canConfigure} />
			</SheetTrigger>

			<FormSheetContent side="right">
				<SheetHeader>
					<SheetTitle>Add an identity provider</SheetTitle>
					<SheetDescription>
						Configure an OpenID Connect provider.
					</SheetDescription>
				</SheetHeader>

				<FormSheetForm
					noValidate
					onInput={validation.onInput}
					id={FORM}
					onSubmit={(event) => {
						event.preventDefault();
						if (
							!settings.data?.canConfigure ||
							!validation.validate(event.currentTarget)
						)
							return;
						register.mutate({
							providerId,
							issuer: values.issuer.trim(),
							domain: values.domain.trim(),
							clientId: values.clientId.trim(),
							clientSecret: values.clientSecret.trim(),
						});
					}}
				>
					<Field data-invalid={!!validation.errors[providerIdId]}>
						<FieldLabel htmlFor={providerIdId}>Name</FieldLabel>
						<Input
							id={providerIdId}
							maxLength={64}
							aria-invalid={!!validation.errors[providerIdId]}
							aria-describedby={
								validation.errors[providerIdId]
									? `${providerIdId}-error`
									: undefined
							}
							value={values.providerId}
							onChange={(event) => edit({ providerId: event.target.value })}
							placeholder="okta"
							autoComplete="off"
							autoCapitalize="off"
							autoCorrect="off"
							spellCheck={false}
							pattern=".*\S.*"
							required
						/>
						<FieldError id={`${providerIdId}-error`}>
							{validation.errors[providerIdId]}
						</FieldError>
						<FieldDescription>
							Names the sign-in button. Cannot be changed later.
						</FieldDescription>
					</Field>

					<Field data-invalid={!!validation.errors[issuerId]}>
						<FieldLabel htmlFor={issuerId}>Issuer URL</FieldLabel>
						<Input
							id={issuerId}
							maxLength={512}
							aria-invalid={!!validation.errors[issuerId]}
							aria-describedby={
								validation.errors[issuerId] ? `${issuerId}-error` : undefined
							}
							type="url"
							value={values.issuer}
							onChange={(event) => edit({ issuer: event.target.value })}
							placeholder="https://acme.okta.com"
							autoComplete="off"
							autoCapitalize="off"
							autoCorrect="off"
							spellCheck={false}
							inputMode="url"
							pattern=".*\S.*"
							required
						/>
						<FieldError id={`${issuerId}-error`}>
							{validation.errors[issuerId]}
						</FieldError>
						<FieldDescription>Where discovery lives.</FieldDescription>
					</Field>

					<Field data-invalid={!!validation.errors[domainId]}>
						<FieldLabel htmlFor={domainId}>Email domain</FieldLabel>
						<Input
							id={domainId}
							maxLength={255}
							aria-invalid={!!validation.errors[domainId]}
							aria-describedby={
								validation.errors[domainId] ? `${domainId}-error` : undefined
							}
							value={values.domain}
							onChange={(event) => edit({ domain: event.target.value })}
							placeholder="acme.com"
							autoComplete="off"
							autoCapitalize="off"
							autoCorrect="off"
							spellCheck={false}
							pattern=".*\S.*"
							required
						/>
						<FieldError id={`${domainId}-error`}>
							{validation.errors[domainId]}
						</FieldError>
						<FieldDescription>Comma-separate several.</FieldDescription>
					</Field>

					<Field data-invalid={!!validation.errors[clientIdId]}>
						<FieldLabel htmlFor={clientIdId}>Client ID</FieldLabel>
						<Input
							id={clientIdId}
							maxLength={512}
							aria-invalid={!!validation.errors[clientIdId]}
							aria-describedby={
								validation.errors[clientIdId]
									? `${clientIdId}-error`
									: undefined
							}
							value={values.clientId}
							onChange={(event) => edit({ clientId: event.target.value })}
							autoComplete="off"
							autoCapitalize="off"
							autoCorrect="off"
							spellCheck={false}
							pattern=".*\S.*"
							required
						/>
						<FieldError id={`${clientIdId}-error`}>
							{validation.errors[clientIdId]}
						</FieldError>
					</Field>

					<Field data-invalid={!!validation.errors[clientSecretId]}>
						<FieldLabel htmlFor={clientSecretId}>Client secret</FieldLabel>
						<Input
							id={clientSecretId}
							maxLength={1024}
							aria-invalid={!!validation.errors[clientSecretId]}
							aria-describedby={
								validation.errors[clientSecretId]
									? `${clientSecretId}-error`
									: undefined
							}
							type="password"
							value={values.clientSecret}
							onChange={(event) => edit({ clientSecret: event.target.value })}
							autoComplete="off"
							pattern=".*\S.*"
							required
						/>
						<FieldError id={`${clientSecretId}-error`}>
							{validation.errors[clientSecretId]}
						</FieldError>
						<FieldDescription>Never shown again.</FieldDescription>
					</Field>

					<Field data-invalid={!!validation.errors[redirectId]}>
						<FieldLabel htmlFor={redirectId}>Redirect URI</FieldLabel>
						<InputGroup>
							<InputGroupInput id={redirectId} value={callbackURL} readOnly />
							<InputGroupAddon align="inline-end">
								<CopyValue value={callbackURL} label="Redirect URI" />
							</InputGroupAddon>
						</InputGroup>
						<FieldDescription>
							Add this at your provider before saving.
						</FieldDescription>
					</Field>
				</FormSheetForm>

				<FormSheetFooter>
					<Button
						type="submit"
						form={FORM}
						disabled={!settings.data?.canConfigure || register.isPending}
					>
						{register.isPending ? <Spinner data-icon="inline-start" /> : null}
						Add provider
					</Button>
				</FormSheetFooter>
			</FormSheetContent>
		</FormSheet>
	);
}
