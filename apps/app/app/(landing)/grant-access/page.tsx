import { mailboxGrantsNeeded } from "@crm/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireSession, signInAccounts } from "@/lib/session";
import { GrantAccess } from "./grant-access";

export const metadata: Metadata = {
	title: "Grant access",
};

export const instant = false;

const DESCRIPTION: Record<string, string> = {
	google:
		"This CRM reads your Gmail and Calendar so meetings and email threads show up on the right company. It is read-only — nothing is ever sent on your behalf.",
	microsoft:
		"This CRM reads your Outlook mail so email threads show up on the right company. It is read-only — nothing is ever sent on your behalf.",
};

const BOTH =
	"This CRM reads your mail and calendar so meetings and email threads show up on the right company. It is read-only — nothing is ever sent on your behalf.";

export default async function GrantAccessPage() {
	const { user } = await requireSession();

	const providers = mailboxGrantsNeeded(await signInAccounts(user.id));

	if (providers.length === 0) {
		redirect("/");
	}

	const only = providers.length === 1 ? providers[0] : undefined;

	return (
		<AuthShell>
			<AuthHeading
				title="One more step"
				description={(only ? DESCRIPTION[only] : undefined) ?? BOTH}
			/>

			<GrantAccess providers={providers} />

			<p className="text-center text-muted-foreground text-sm/5">
				Only conversations with companies in the CRM are stored. Personal mail
				is discarded without being saved.
			</p>
		</AuthShell>
	);
}
