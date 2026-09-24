import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
	title: "Reset password",
};

export default async function ResetPasswordPage({
	searchParams,
}: PageProps<"/reset-password">) {
	return (
		<AuthShell>
			<AuthHeading
				title="Choose a new password"
				description="Enter a new password for your CRM account."
			/>
			<Suspense fallback={null}>
				<ResetPassword searchParams={searchParams} />
			</Suspense>
		</AuthShell>
	);
}

async function ResetPassword({
	searchParams,
}: Pick<PageProps<"/reset-password">, "searchParams">) {
	const { token, error } = await searchParams;

	return (
		<ResetPasswordForm
			token={typeof token === "string" ? token : undefined}
			error={typeof error === "string" ? error : undefined}
		/>
	);
}
