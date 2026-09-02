"use client";

import { signIn } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";

export function PasswordSignIn() {
	const router = useRouter();
	const emailId = useId();
	const passwordId = useId();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);

		const { error } = await signIn.email({ email, password });

		if (error) {
			setPending(false);
			toast.error(error.message ?? "Could not sign in.");
			return;
		}

		router.replace("/");
		router.refresh();
	}

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				handleSubmit(event).catch(() => {
					setPending(false);
					toast.error("Could not reach the sign-in service.");
				});
			}}
		>
			<Field>
				<FieldLabel htmlFor={emailId}>Email</FieldLabel>
				<Input
					id={emailId}
					type="email"
					autoComplete="email"
					required
					value={email}
					onChange={(event) => setEmail(event.target.value)}
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor={passwordId}>Password</FieldLabel>
				<Input
					id={passwordId}
					type="password"
					autoComplete="current-password"
					required
					value={password}
					onChange={(event) => setPassword(event.target.value)}
				/>
			</Field>
			<Button className="w-full" disabled={pending} type="submit">
				{pending ? <Spinner data-icon="inline-start" /> : null}
				Sign in
			</Button>
		</form>
	);
}
