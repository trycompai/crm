"use client";

import { authClient } from "@crm/auth/client";
import { OUTREACH_SCOPES } from "@crm/auth/scopes";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Switch } from "@crm/ui/components/switch";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ProspectingControls() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const products = useQuery(trpc.prospecting.products.queryOptions());
	const users = useQuery(trpc.users.list.queryOptions());
	const [domains, setDomains] = useState("");
	const [source, setSource] = useState("https://www.consumidor.gov.pt/");

	const update = useMutation(
		trpc.prospecting.updateProduct.mutationOptions({
			onSuccess: () => cache.prospecting(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const importDgc = useMutation(
		trpc.prospecting.importPortugueseDgc.mutationOptions({
			onSuccess: (result) => {
				toast.success(`Imported ${result.entryCount} DGC entries.`);
				setDomains("");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	async function grantSendAccess() {
		const origin = window.location.origin;
		const { error } = await authClient.linkSocial({
			provider: "google",
			scopes: [...OUTREACH_SCOPES],
			callbackURL: `${origin}/prospecting`,
			errorCallbackURL: `${origin}/prospecting`,
		});
		if (error) toast.error(error.message ?? "Could not reach Google.");
	}

	return (
		<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
			<div className="grid gap-4 md:grid-cols-3">
				{products.data?.map((product) => (
					<Card key={product.id}>
						<CardHeader>
							<CardTitle>{product.name}</CardTitle>
							<CardDescription>
								{product.offerName} · {product.offerPrice}
							</CardDescription>
							<CardAction>
								<Switch
									aria-label={`Enable ${product.name}`}
									checked={product.active}
									disabled={update.isPending}
									onCheckedChange={(active) =>
										update.mutate({ id: product.id, active })
									}
								/>
							</CardAction>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-3 text-xs">
								<div>
									<p className="text-muted-foreground">Discovery/day</p>
									<p className="font-medium tabular-nums">
										{product.discoveryDailyCap}
									</p>
								</div>
								<div>
									<p className="text-muted-foreground">Send/day</p>
									<p className="font-medium tabular-nums">
										{product.outreachDailyCap}
									</p>
								</div>
							</div>
							<Label className="flex flex-col items-start gap-1">
								Sender mailbox
								<select
									className="h-8 w-full rounded-md border bg-background px-2 text-xs"
									value={product.senderUserId ?? ""}
									onChange={(event) =>
										update.mutate({
											id: product.id,
											senderUserId: event.target.value || null,
										})
									}
								>
									<option value="">Not assigned</option>
									{users.data?.map((user) => (
										<option key={user.id} value={user.id}>
											{user.name}
										</option>
									))}
								</select>
							</Label>
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground text-xs">
									{product.commercialReadyAt
										? "Ready to send"
										: "Sending blocked"}
								</span>
								<Switch
									aria-label={`Commercial readiness for ${product.name}`}
									checked={Boolean(product.commercialReadyAt)}
									disabled={update.isPending}
									onCheckedChange={(commercialReady) =>
										update.mutate({ id: product.id, commercialReady })
									}
								/>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Sending & compliance</CardTitle>
					<CardDescription>
						Grant Gmail send and maintain the Portuguese DGC list.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void grantSendAccess()}
					>
						Grant Gmail send
					</Button>
					<Label className="flex flex-col items-start gap-1">
						DGC source URL
						<Input
							value={source}
							onChange={(event) => setSource(event.target.value)}
						/>
					</Label>
					<Label className="flex flex-col items-start gap-1">
						Blocked domains, one per line
						<Textarea
							rows={4}
							value={domains}
							onChange={(event) => setDomains(event.target.value)}
						/>
					</Label>
					<Button
						size="sm"
						disabled={importDgc.isPending || !domains.trim()}
						onClick={() =>
							importDgc.mutate({
								source,
								effectiveAt: new Date().toISOString(),
								domains: domains
									.split(/[\n,;]/)
									.map((value) => value.trim())
									.filter(Boolean),
							})
						}
					>
						Import DGC snapshot
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
