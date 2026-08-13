"use client";

import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useState, useTransition } from "react";
import { unsubscribe } from "./actions";

export function UnsubscribeForm({
	token,
	address,
	already,
	workspace,
}: {
	token: string;
	address: string | null;
	already: boolean;
	workspace: string;
}) {
	const [done, setDone] = useState(already);
	const [failed, setFailed] = useState(false);
	const [pending, startTransition] = useTransition();

	if (done) {
		return (
			<>
				<h1 className="font-medium text-lg tracking-tight">
					You are unsubscribed
				</h1>
				<p className="text-muted-foreground text-xs">
					{address
						? `${address} will get no more marketing email from ${workspace}.`
						: `That address will get no more marketing email from ${workspace}.`}
				</p>
				<p className="text-muted-foreground text-xs">
					This does not stop a reply to a conversation you started, and it does
					not close your account.
				</p>
			</>
		);
	}

	return (
		<>
			<h1 className="font-medium text-lg tracking-tight">
				Unsubscribe from {workspace}
			</h1>

			<p className="text-muted-foreground text-xs">
				{address
					? `${address} will get no more marketing email. Replies to a conversation you started still reach us.`
					: "You will get no more marketing email. Replies to a conversation you started still reach us."}
			</p>

			{failed ? (
				<p className="text-destructive text-xs">
					That did not save. Try once more, and if it still fails, reply to any
					of our emails and we will do it by hand.
				</p>
			) : null}

			<Button
				className="self-start"
				disabled={pending}
				onClick={() =>
					startTransition(async () => {
						const result = await unsubscribe(token);
						if (result.ok) setDone(true);
						else setFailed(true);
					})
				}
			>
				{pending ? <Spinner /> : null}
				Unsubscribe
			</Button>
		</>
	);
}
