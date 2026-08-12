"use client";

import Renew from "@carbon/icons-react/es/Renew";
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
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { useQuery } from "@tanstack/react-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

type GatewayState = {
	label: string;
	tone: StatusTone;
};

function gatewayState(input: {
	configured: boolean;
	paused: boolean;
	error: string | null;
}): GatewayState {
	if (!input.configured) return { label: "Not configured", tone: "neutral" };
	if (input.paused) return { label: "Paused", tone: "warning" };
	if (input.error) return { label: "Needs attention", tone: "error" };
	return { label: "Configured", tone: "success" };
}

function credentialLabel(source: string): string {
	if (source === "ai_gateway_key") return "AI Gateway key";
	if (source === "vercel_oidc") return "Vercel OIDC";
	return "No Gateway credential";
}

export function AiGatewayConnection() {
	const trpc = useTRPC();
	const status = useQuery(trpc.settings.aiGatewayStatus.queryOptions());
	const catalog = useQuery({
		...trpc.settings.modelCatalog.queryOptions(),
		enabled: false,
		retry: false,
	});

	if (!status.data) return null;

	const state = gatewayState({
		configured: status.data.configured,
		paused: status.data.paused,
		error: status.data.lastError,
	});
	const catalogChecked = catalog.data !== undefined;

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						AI Gateway
						<StatusIndicator size="sm" tone={state.tone} label={state.label} />
					</div>
				</CardTitle>
				<CardDescription>
					Model routing for agent runs. The catalog test lists available
					tool-use models and does not start an agent session.
				</CardDescription>

				<CardAction>
					<Button
						variant="contrast"
						size="sm"
						disabled={!status.data.canTest || catalog.isFetching}
						onClick={() => {
							void catalog.refetch();
						}}
					>
						{catalog.isFetching ? (
							<Spinner data-icon="inline-start" />
						) : (
							<Icon icon={Renew} data-icon="inline-start" />
						)}
						Test
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				{status.data.lastError ? (
					<Alert variant="destructive">
						<Icon icon={Warning} />
						<AlertTitle>Latest model-backed task failed</AlertTitle>
						<AlertDescription>{status.data.lastError}</AlertDescription>
					</Alert>
				) : null}

				<p className="text-sm">
					{status.data.selectedId
						? `Selected model ${status.data.effectiveId}`
						: `Default model ${status.data.defaultId}`}
				</p>
				<p className="text-muted-foreground text-xs">
					{credentialLabel(status.data.credentialSource)}
					{status.data.updatedAt ? (
						<>
							{" "}
							· Model setting changed{" "}
							<LocalRelativeTime date={status.data.updatedAt} />
						</>
					) : null}
				</p>
				<p className="text-muted-foreground text-xs">
					{status.data.lastModelTaskAt ? (
						<>
							Last local model task{" "}
							<LocalRelativeTime date={status.data.lastModelTaskAt} />
						</>
					) : (
						"No local model-backed task has reported usage yet"
					)}
				</p>
				{catalogChecked ? (
					<p className="text-muted-foreground text-xs">
						{catalog.data?.available
							? `Catalog test passed with ${catalog.data.models.length.toLocaleString()} tool-use models.`
							: "Catalog test could not reach the AI Gateway."}
					</p>
				) : null}
				{status.data.configured ? null : (
					<p className="text-muted-foreground text-xs">
						Set a dedicated AI_GATEWAY_API_KEY before production model work.
						Vercel OIDC alone does not open the production spend gate.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
