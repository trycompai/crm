"use client";

import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const STATUSES = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "ONBOARDING", label: "Onboarding" },
	{ value: "PAUSED", label: "Paused" },
	{ value: "CHURNED", label: "Churned" },
] as const;

export function CreateClientSheet({ trigger }: { trigger?: ReactNode }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [status, setStatus] = useState("ACTIVE");
	const [industry, setIndustry] = useState("");
	const [website, setWebsite] = useState("");
	const [retainer, setRetainer] = useState("");
	const [notes, setNotes] = useState("");

	const mutation = useMutation(
		trpc.clientAccounts.create.mutationOptions({
			onSuccess: async () => {
				toast.success("Client added");
				setOpen(false);
				setName("");
				setIndustry("");
				setWebsite("");
				setRetainer("");
				setNotes("");
				await queryClient.invalidateQueries({
					queryKey: trpc.clientAccounts.list.queryKey(),
				});
				await queryClient.invalidateQueries({
					queryKey: trpc.clientAccounts.options.queryKey(),
				});
			},
			onError: (err) => toast.error(err.message),
		}),
	);

	function submit() {
		if (!name.trim()) return;
		const cents = retainer ? Math.round(Number(retainer) * 100) : undefined;
		mutation.mutate({
			name: name.trim(),
			status: status as "ACTIVE" | "ONBOARDING" | "PAUSED" | "CHURNED",
			industry: industry.trim() || undefined,
			website: website.trim() || undefined,
			monthlyRetainerCents: Number.isFinite(cents) ? cents : undefined,
			notes: notes.trim() || undefined,
		});
	}

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				{trigger ?? <Button>Add client</Button>}
			</SheetTrigger>
			<SheetContent side="right" className="w-full sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>New client</SheetTitle>
					<SheetDescription>
						A client is the top-level container for a business you serve.
					</SheetDescription>
				</SheetHeader>
				<form
					className="grid gap-4 px-4"
					onSubmit={(e) => {
						e.preventDefault();
						submit();
					}}
				>
					<Field label="Name" required>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Acme Co"
							autoFocus
						/>
					</Field>
					<Field label="Status">
						<Select value={status} onValueChange={setStatus}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{STATUSES.map((s) => (
									<SelectItem key={s.value} value={s.value}>
										{s.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field label="Industry">
						<Input
							value={industry}
							onChange={(e) => setIndustry(e.target.value)}
							placeholder="e.g. Roofing, SaaS, Restaurant"
						/>
					</Field>
					<Field label="Website">
						<Input
							type="url"
							value={website}
							onChange={(e) => setWebsite(e.target.value)}
							placeholder="https://example.com"
						/>
					</Field>
					<Field label="Monthly retainer (USD)">
						<Input
							type="number"
							step="0.01"
							value={retainer}
							onChange={(e) => setRetainer(e.target.value)}
							placeholder="0.00"
						/>
					</Field>
					<Field label="Notes">
						<Textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							rows={4}
							placeholder="Anything worth remembering about this client…"
						/>
					</Field>
				</form>
				<SheetFooter>
					<Button
						variant="outline"
						type="button"
						onClick={() => setOpen(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={submit}
						disabled={mutation.isPending || !name.trim()}
					>
						{mutation.isPending ? "Saving…" : "Create client"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function Field({
	label,
	required,
	children,
}: {
	label: string;
	required?: boolean;
	children: ReactNode;
}) {
	return (
		<div className="grid gap-1.5">
			<Label>
				{label}
				{required && <span className="ml-0.5 text-destructive">*</span>}
			</Label>
			{children}
		</div>
	);
}
