"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
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
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { CopyValue } from "./copy-value";

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
			<Icon icon={Add} data-icon="inline-start" />
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
		"new",
		parseAsBoolean.withDefault(false),
	);
	const [values, setValues] = useState(EMPTY);

	const register = useMutation(
		trpc.sso.register.mutationOptions({
			onSuccess: async (provider) => {
				await cache.sso();
				toast.success(`${provider.name} saved.`);
				await setOpen(null);
				setValues(EMPTY);
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

	const complete = Object.values(values).every((value) => value.trim() !== "");

	return (
		<Sheet open={open} onOpenChange={(next) => setOpen(next || null)}>
			<SheetTrigger asChild>
				<AddButton disabled={!settings.data?.canConfigure} />
			</SheetTrigger>

			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>Add an identity provider</SheetTitle>
					<SheetDescription>
						Configure an OpenID Connect provider.
					</SheetDescription>
				</SheetHeader>

				<form
					id={FORM}
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						register.mutate({
							providerId,
							issuer: values.issuer.trim(),
							domain: values.domain.trim(),
							clientId: values.clientId.trim(),
							clientSecret: values.clientSecret.trim(),
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={providerIdId}>Name</FieldLabel>
							<Input
								id={providerIdId}
								value={values.providerId}
								onChange={(event) => edit({ providerId: event.target.value })}
								placeholder="okta"
								autoComplete="off"
								autoCapitalize="off"
								autoCorrect="off"
								spellCheck={false}
								required
							/>
							<FieldDescription>
								Names the sign-in button. Cannot be changed later.
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={issuerId}>Issuer URL</FieldLabel>
							<Input
								id={issuerId}
								type="url"
								value={values.issuer}
								onChange={(event) => edit({ issuer: event.target.value })}
								placeholder="https://acme.okta.com"
								autoComplete="off"
								autoCapitalize="off"
								autoCorrect="off"
								spellCheck={false}
								inputMode="url"
								required
							/>
							<FieldDescription>Where discovery lives.</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={domainId}>Email domain</FieldLabel>
							<Input
								id={domainId}
								value={values.domain}
								onChange={(event) => edit({ domain: event.target.value })}
								placeholder="acme.com"
								autoComplete="off"
								autoCapitalize="off"
								autoCorrect="off"
								spellCheck={false}
								required
							/>
							<FieldDescription>Comma-separate several.</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={clientIdId}>Client ID</FieldLabel>
							<Input
								id={clientIdId}
								value={values.clientId}
								onChange={(event) => edit({ clientId: event.target.value })}
								autoComplete="off"
								autoCapitalize="off"
								autoCorrect="off"
								spellCheck={false}
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={clientSecretId}>Client secret</FieldLabel>
							<Input
								id={clientSecretId}
								type="password"
								value={values.clientSecret}
								onChange={(event) => edit({ clientSecret: event.target.value })}
								autoComplete="off"
								required
							/>
							<FieldDescription>Never shown again.</FieldDescription>
						</Field>

						<Field>
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
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form={FORM}
						disabled={!complete || register.isPending}
					>
						{register.isPending ? <Spinner /> : null}
						Add provider
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancel</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
