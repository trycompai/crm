import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { GoogleSignIn } from "./google-sign-in";
import { type SsoProvider, SsoSignIn } from "./sso-sign-in";

export const metadata: Metadata = {
	title: "Sign in",
};

export const dynamic = "force-dynamic";

type SignInOptions = { google: boolean; providers: SsoProvider[] };

async function signInOptions(): Promise<SignInOptions | null> {
	try {
		return await getServerQueryClient().fetchQuery(
			getServerTrpc().sso.signInOptions.queryOptions(),
		);
	} catch (error) {
		console.error("Sign-in: could not read the sign-in options.", error);
		return null;
	}
}

export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<{ method?: string | string[] }>;
}) {
	const [session, options, { method }] = await Promise.all([
		getSession().catch((error: unknown) => {
			console.error("Sign-in: could not read the session.", error);
			return null;
		}),
		signInOptions(),
		searchParams,
	]);

	if (session) {
		redirect("/");
	}

	const google = options?.google ?? true;
	const providers = options?.providers ?? [];

	const insistOnGoogle = method === "google" && google;
	const showSso = providers.length > 0 && !insistOnGoogle;
	const showGoogle = google && (providers.length === 0 || insistOnGoogle);

	if (!showSso && !showGoogle) {
		return (
			<AuthShell>
				<AuthHeading
					title="No way in yet"
					description="This CRM has no sign-in method configured, so nobody can get in — including you."
				/>

				<p className="text-center text-muted-foreground text-sm/5">
					Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the root .env file
					and restart. Your own identity provider can be added from Settings
					once somebody is signed in.
				</p>
			</AuthShell>
		);
	}

	return (
		<AuthShell>
			<AuthHeading
				title="Welcome back"
				description="Sign in with your account to continue."
			/>

			{showSso ? <SsoSignIn providers={providers} /> : null}
			{showGoogle ? <GoogleSignIn /> : null}
		</AuthShell>
	);
}
