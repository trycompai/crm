"use client";

import { signOut } from "@crm/auth/client";
import { toast } from "sonner";

export async function signOutAndRedirect() {
	const { error } = await signOut();

	if (error) {
		toast.error(error.message ?? "Could not sign out.");
		return;
	}

	window.location.assign("/sign-in");
}
