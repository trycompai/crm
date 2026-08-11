"use client";

import CheckmarkFilled from "@carbon/icons-react/es/CheckmarkFilled";
import Warning from "@carbon/icons-react/es/Warning";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@crm/ui/components/input-group";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Result = RouterOutputs["tracking"]["verify"];

export function VerifyInstallation() {
	const trpc = useTRPC();
	const urlId = useId();

	const [url, setUrl] = useState("");
	const [result, setResult] = useState<Result | null>(null);

	const tracking = useQuery(trpc.tracking.settings.queryOptions());

	const verify = useMutation(
		trpc.tracking.verify.mutationOptions({
			onSuccess: (outcome) => setResult(outcome),
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!tracking.data) return null;

	const { canManage, siteId } = tracking.data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Verify installation
						{result ? <Indicator result={result} /> : null}
					</div>
				</CardTitle>
				<CardDescription>
					We load one page and look for the script.
				</CardDescription>

				<CardAction>
					<Button
						size="sm"
						type="submit"
						form="verify-tracking"
						disabled={!canManage || verify.isPending || url.trim() === ""}
					>
						{verify.isPending ? <Spinner data-icon="inline-start" /> : null}
						Check now
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				<form
					id="verify-tracking"
					onSubmit={(event) => {
						event.preventDefault();
						setResult(null);
						verify.mutate({ url: url.trim() });
					}}
				>
					<Field>
						<FieldLabel htmlFor={urlId}>Page to check</FieldLabel>
						<InputGroup>
							<InputGroupAddon>
								<InputGroupText>https://</InputGroupText>
							</InputGroupAddon>
							<InputGroupInput
								id={urlId}
								value={url}
								onChange={(event) => {
									setUrl(event.target.value);
									setResult(null);
								}}
								placeholder="acme.com/pricing"
								autoComplete="off"
								autoCapitalize="off"
								autoCorrect="off"
								spellCheck={false}
								inputMode="url"
								disabled={!canManage || verify.isPending}
							/>
						</InputGroup>
						<FieldDescription>
							The page has to be public. A page behind a login always fails this
							check.
						</FieldDescription>
					</Field>
				</form>

				{result && siteId ? <Outcome result={result} siteId={siteId} /> : null}
			</CardContent>
		</Card>
	);
}

function Indicator({ result }: { result: Result }) {
	if (result.status === "found" && result.pageView) {
		return (
			<StatusIndicator size="sm" tone="success" label="Verified just now" />
		);
	}

	return (
		<StatusIndicator
			size="sm"
			tone="warning"
			label={result.status === "found" ? "No page view yet" : "Not detected"}
		/>
	);
}

function Outcome({ result, siteId }: { result: Result; siteId: string }) {
	if (result.status === "unreachable") {
		return (
			<Alert variant="destructive">
				<Icon icon={Warning} />
				<AlertTitle>Could not open {result.host}</AlertTitle>
				<AlertDescription>
					{result.detail} We only follow public pages, and we never follow a
					redirect to a private address.
				</AlertDescription>
			</Alert>
		);
	}

	if (result.status === "missing") {
		return (
			<Alert variant="destructive">
				<Icon icon={Warning} />
				<AlertTitle>No script on {result.host}</AlertTitle>
				<AlertDescription>
					The page answered in {result.responseMs} ms, but the tag was not in
					the HTML. Check that it sits in the head, above anything that rewrites
					the page.
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<Alert>
			<Icon icon={CheckmarkFilled} className="text-success" />
			<AlertTitle>Script found on {result.host}</AlertTitle>
			<AlertDescription>
				It answered in {result.responseMs} ms. Site ID {siteId} matched, and
				this domain is {result.allowed ? "on" : "not on"} the allow list.
				{result.pageView
					? " A page view arrived in the last five minutes."
					: " No page view has arrived yet — open the page in a browser to send one."}
			</AlertDescription>
		</Alert>
	);
}
