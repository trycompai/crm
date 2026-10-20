"use client";

import { authClient } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { useId, useState } from "react";
import { toast } from "sonner";

export function ChangePassword() {
	const currentId = useId();
	const nextId = useId();
	const confirmId = useId();
	const [pending, setPending] = useState(false);

	async function submit(formData: FormData) {
		const currentPassword = String(formData.get("currentPassword") ?? "");
		const newPassword = String(formData.get("newPassword") ?? "");
		const confirmPassword = String(formData.get("confirmPassword") ?? "");

		if (newPassword.length < 8) {
			toast.error("New password must be at least 8 characters.");
			return;
		}
		if (newPassword !== confirmPassword) {
			toast.error("New passwords do not match.");
			return;
		}

		setPending(true);
		try {
			const { error } = await authClient.changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions: true,
			});
			if (error) {
				toast.error(error.message || "Could not change password.");
				return;
			}
			(document.getElementById("change-password") as HTMLFormElement | null)?.reset();
			toast.success("Password changed. Other sessions were signed out.");
		} catch {
			toast.error("Could not reach the authentication service.");
		} finally {
			setPending(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Password</CardTitle>
				<CardDescription>
					Change your CRM login password. This does not change any environment secret.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form id="change-password" action={(formData) => { void submit(formData); }}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={currentId}>Current password</FieldLabel>
							<Input id={currentId} name="currentPassword" type="password" autoComplete="current-password" required disabled={pending} />
						</Field>
						<Field>
							<FieldLabel htmlFor={nextId}>New password</FieldLabel>
							<Input id={nextId} name="newPassword" type="password" autoComplete="new-password" minLength={8} required disabled={pending} />
							<FieldDescription>At least 8 characters.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor={confirmId}>Confirm new password</FieldLabel>
							<Input id={confirmId} name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required disabled={pending} />
						</Field>
						<Button type="submit" disabled={pending}>{pending ? "Changing password…" : "Change password"}</Button>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
