"use client";

import { authClient } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";

const NEUTRAL_MESSAGE =
	"If that address exists, a password reset link has been sent.";

export function ForgotPasswordForm() {
	const emailId = useId();
	const [pending, setPending] = useState(false);
	const [sent, setSent] = useState(false);

	async function submit(formData: FormData) {
		const email = String(formData.get("email") ?? "").trim();
		if (!email) {
			toast.error("Email is required.");
			return;
		}

		setPending(true);
		try {
			await authClient.requestPasswordReset({
				email,
				redirectTo: `${window.location.origin}/reset-password`,
			});
			setSent(true);
			toast.success(NEUTRAL_MESSAGE);
		} catch {
			setSent(true);
			toast.success(NEUTRAL_MESSAGE);
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="space-y-4">
			<form
				action={(formData) => {
					submit(formData).catch(() => {
						setSent(true);
						toast.success(NEUTRAL_MESSAGE);
					});
				}}
				className="space-y-4"
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={emailId}>Email</FieldLabel>
						<Input
							id={emailId}
							name="email"
							type="email"
							autoComplete="email"
							required
							disabled={pending || sent}
						/>
						<FieldDescription>{NEUTRAL_MESSAGE}</FieldDescription>
					</Field>
				</FieldGroup>

				<Button type="submit" className="w-full" disabled={pending || sent}>
					{pending ? "Sending reset link..." : "Send reset link"}
				</Button>
			</form>

			<Link
				href="/sign-in"
				className="block w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
			>
				Back to sign in
			</Link>
		</div>
	);
}
