import { db } from "@crm/db";
import { readWorkspaceIdentity } from "@crm/db/workspace";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = { title: "Unsubscribe" };

export default function UnsubscribePage({ params }: PageProps<"/u/[token]">) {
	return (
		<main className="flex min-h-svh items-center justify-center bg-muted px-6 py-16">
			<Suspense fallback={<Card />}>
				<Unsubscribe params={params} />
			</Suspense>
		</main>
	);
}

async function Unsubscribe({
	params,
}: Pick<PageProps<"/u/[token]">, "params">) {
	await connection();
	const { token } = await params;

	const [recipient, workspace] = await Promise.all([
		db.marketingRecipient
			.findUnique({
				where: { token },
				select: { address: true, status: true },
			})
			.catch(() => null),
		readWorkspaceIdentity(db).catch(() => null),
	]);

	return (
		<Card>
			<UnsubscribeForm
				token={token}
				address={recipient?.address ?? null}
				already={recipient?.status === "UNSUBSCRIBED"}
				workspace={workspace?.name ?? "this workspace"}
			/>
		</Card>
	);
}

function Card({ children }: { children?: React.ReactNode }) {
	return (
		<div className="flex w-full max-w-md flex-col gap-4 rounded-lg border bg-background p-8">
			{children}
		</div>
	);
}
