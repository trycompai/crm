"use client";

import { authClient, signIn } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

export function EmailPasswordSignIn() {
	const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
	const [pending, setPending] = useState(false);

	async function submit(formData: FormData) {
		const email = String(formData.get("email") ?? "").trim();
		const password = String(formData.get("password") ?? "");
		const name = String(formData.get("name") ?? "").trim();

		if (!email || !password) {
			toast.error("Email and password are required.");
			return;
		}

		setPending(true);
		const callbackURL = `${window.location.origin}/`;

		try {
			const result =
				mode === "create"
					? await authClient.signUp.email({
							email,
							password,
							name: name || email.split("@")[0] || "User",
							callbackURL,
						})
					: await signIn.email({
							email,
							password,
							callbackURL,
						});

			if (result.error) {
				toast.error(result.error.message || "Could not sign in.");
				return;
			}

			window.location.assign(callbackURL);
		} catch {
			toast.error("Could not reach the sign-in service.");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="space-y-4">
			<form
				action={(formData) => {
					submit(formData).catch(() => {
						toast.error("Could not sign in.");
					});
				}}
				className="space-y-3"
			>
				{mode === "create" ? (
					<Input name="name" placeholder="Name" autoComplete="name" />
				) : null}
				<Input
					name="email"
					type="email"
					placeholder="Email"
					autoComplete="email"
					required
				/>
				<Input
					name="password"
					type="password"
					placeholder="Password"
					autoComplete={mode === "create" ? "new-password" : "current-password"}
					minLength={8}
					required
				/>
				{mode === "sign-in" ? (
					<div className="flex justify-end">
						<Link
							href="/forgot-password"
							className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
						>
							Forgot password?
						</Link>
					</div>
				) : null}
				<Button type="submit" className="w-full" disabled={pending}>
					{pending
						? "Please wait…"
						: mode === "create"
							? "Create account"
							: "Sign in"}
				</Button>
			</form>

			<button
				type="button"
				className="w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
				onClick={() => setMode(mode === "sign-in" ? "create" : "sign-in")}
			>
				{mode === "sign-in"
					? "First time here? Create account"
					: "Already have an account? Sign in"}
			</button>
		</div>
	);
}
