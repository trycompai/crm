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

type ResetPasswordFormProps = {
	token?: string;
	error?: string;
};

export function ResetPasswordForm({ token, error }: ResetPasswordFormProps) {
	const passwordId = useId();
	const confirmId = useId();
	const [pending, setPending] = useState(false);
	const [complete, setComplete] = useState(false);

	const invalidToken = !token || error === "INVALID_TOKEN";

	async function submit(formData: FormData) {
		if (!token) return;

		const newPassword = String(formData.get("newPassword") ?? "");
		const confirmPassword = String(formData.get("confirmPassword") ?? "");

		if (newPassword.length < 8) {
			toast.error("Password must be at least 8 characters.");
			return;
		}

		if (newPassword !== confirmPassword) {
			toast.error("Passwords do not match.");
			return;
		}

		setPending(true);
		try {
			const { error } = await authClient.resetPassword({
				newPassword,
				token,
			});

			if (error) {
				toast.error(error.message || "Could not reset password.");
				return;
			}

			setComplete(true);
			toast.success("Password reset. You can sign in now.");
			window.setTimeout(() => {
				window.location.assign("/sign-in");
			}, 1200);
		} catch {
			toast.error("Could not reset password.");
		} finally {
			setPending(false);
		}
	}

	if (invalidToken) {
		return (
			<div className="space-y-4">
				<p className="text-sm/5 text-muted-foreground">
					This password reset link is invalid or expired.
				</p>
				<Button asChild className="w-full">
					<Link href="/forgot-password">Request a new link</Link>
				</Button>
			</div>
		);
	}

	if (complete) {
		return (
			<div className="space-y-4">
				<p className="text-sm/5 text-muted-foreground">
					Your password has been reset. Redirecting to sign in...
				</p>
				<Button asChild className="w-full">
					<Link href="/sign-in">Back to sign in</Link>
				</Button>
			</div>
		);
	}

	return (
		<form
			action={(formData) => {
				submit(formData).catch(() => {
					toast.error("Could not reset password.");
				});
			}}
			className="space-y-4"
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor={passwordId}>New password</FieldLabel>
					<Input
						id={passwordId}
						name="newPassword"
						type="password"
						autoComplete="new-password"
						minLength={8}
						required
						disabled={pending}
					/>
					<FieldDescription>At least 8 characters.</FieldDescription>
				</Field>
				<Field>
					<FieldLabel htmlFor={confirmId}>Confirm new password</FieldLabel>
					<Input
						id={confirmId}
						name="confirmPassword"
						type="password"
						autoComplete="new-password"
						minLength={8}
						required
						disabled={pending}
					/>
				</Field>
			</FieldGroup>

			<Button type="submit" className="w-full" disabled={pending}>
				{pending ? "Resetting password..." : "Reset password"}
			</Button>
		</form>
	);
}
