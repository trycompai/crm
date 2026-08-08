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

type StepDraft = { id: string } & (
	| { action: "send_sms"; to: string; body: string }
	| { action: "send_email"; to: string; subject: string; body: string }
	| { action: "add_tag"; tag: string }
	| { action: "wait"; minutes: number }
	| { action: "agent_task"; prompt: string }
);

const nextId = () => Math.random().toString(36).slice(2, 10);

const TRIGGERS = [
	{ value: "FORM_SUBMITTED", label: "Form submitted" },
	{ value: "CONTACT_CREATED", label: "Contact created" },
	{ value: "DEAL_STAGE_CHANGED", label: "Deal stage changed" },
	{ value: "SMS_RECEIVED", label: "SMS received" },
	{ value: "MANUAL", label: "Manual only" },
] as const;

export function CreateWorkflowSheet({ trigger }: { trigger?: ReactNode }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [triggerKind, setTriggerKind] = useState<
		| "FORM_SUBMITTED"
		| "CONTACT_CREATED"
		| "DEAL_STAGE_CHANGED"
		| "SMS_RECEIVED"
		| "MANUAL"
	>("FORM_SUBMITTED");
	const [steps, setSteps] = useState<StepDraft[]>([
		{ id: nextId(), action: "send_sms", to: "{{contact.phone}}", body: "" },
	]);

	const create = useMutation(
		trpc.workflows.create.mutationOptions({
			onSuccess: async () => {
				toast.success("Workflow saved as draft");
				setOpen(false);
				setName("");
				setDescription("");
				setSteps([
					{
						id: nextId(),
						action: "send_sms",
						to: "{{contact.phone}}",
						body: "",
					},
				]);
				await queryClient.invalidateQueries({
					queryKey: trpc.workflows.list.queryKey(),
				});
			},
			onError: (err) => toast.error(err.message),
		}),
	);

	function submit() {
		if (!name.trim()) return;
		create.mutate({
			name: name.trim(),
			description: description.trim() || undefined,
			status: "DRAFT",
			triggerKind,
			triggerConfig: {},
			steps: steps as unknown as never[],
		});
	}

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				{trigger ?? <Button>New workflow</Button>}
			</SheetTrigger>
			<SheetContent side="right" className="w-full sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>New workflow</SheetTitle>
					<SheetDescription>
						When the trigger fires, these steps run top-to-bottom.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 px-4">
					<div className="grid gap-1.5">
						<Label>Name</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Welcome new leads"
						/>
					</div>
					<div className="grid gap-1.5">
						<Label>Description</Label>
						<Textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label>Trigger</Label>
						<Select
							value={triggerKind}
							onValueChange={(v) => setTriggerKind(v as typeof triggerKind)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TRIGGERS.map((t) => (
									<SelectItem key={t.value} value={t.value}>
										{t.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div>
						<div className="mb-2 flex items-center justify-between">
							<Label>Steps</Label>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() =>
									setSteps((prev) => [
										...prev,
										{
											id: nextId(),
											action: "send_sms",
											to: "{{contact.phone}}",
											body: "",
										},
									])
								}
							>
								+ Add step
							</Button>
						</div>
						<div className="flex flex-col gap-3">
							{steps.map((step, i) => (
								<StepEditor
									key={step.id}
									step={step}
									onChange={(next) =>
										setSteps((prev) => prev.map((s, j) => (j === i ? next : s)))
									}
									onRemove={() =>
										setSteps((prev) => prev.filter((_, j) => j !== i))
									}
								/>
							))}
						</div>
					</div>
				</div>
				<SheetFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button onClick={submit} disabled={!name.trim() || create.isPending}>
						{create.isPending ? "Saving…" : "Save draft"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function StepEditor({
	step,
	onChange,
	onRemove,
}: {
	step: StepDraft;
	onChange: (next: StepDraft) => void;
	onRemove: () => void;
}) {
	return (
		<div className="rounded-md border bg-muted/30 p-3">
			<div className="mb-2 flex items-center justify-between">
				<Select
					value={step.action}
					onValueChange={(v) => {
						const action = v as StepDraft["action"];
						const id = step.id;
						if (action === "send_sms")
							onChange({ id, action, to: "{{contact.phone}}", body: "" });
						else if (action === "send_email")
							onChange({
								id,
								action,
								to: "{{contact.email}}",
								subject: "",
								body: "",
							});
						else if (action === "add_tag") onChange({ id, action, tag: "" });
						else if (action === "wait") onChange({ id, action, minutes: 60 });
						else if (action === "agent_task")
							onChange({ id, action, prompt: "" });
					}}
				>
					<SelectTrigger className="w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="send_sms">Send SMS</SelectItem>
						<SelectItem value="send_email">Send email</SelectItem>
						<SelectItem value="add_tag">Add tag</SelectItem>
						<SelectItem value="wait">Wait</SelectItem>
						<SelectItem value="agent_task">Ask the agent</SelectItem>
					</SelectContent>
				</Select>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="text-muted-foreground"
					onClick={onRemove}
				>
					Remove
				</Button>
			</div>
			{step.action === "send_sms" && (
				<div className="grid gap-2">
					<Input
						value={step.to}
						onChange={(e) => onChange({ ...step, to: e.target.value })}
						placeholder="Recipient (or {{contact.phone}})"
					/>
					<Textarea
						value={step.body}
						onChange={(e) => onChange({ ...step, body: e.target.value })}
						rows={3}
						placeholder="Hi {{contact.firstName}}, thanks for reaching out…"
					/>
				</div>
			)}
			{step.action === "send_email" && (
				<div className="grid gap-2">
					<Input
						value={step.to}
						onChange={(e) => onChange({ ...step, to: e.target.value })}
						placeholder="Recipient (or {{contact.email}})"
					/>
					<Input
						value={step.subject}
						onChange={(e) => onChange({ ...step, subject: e.target.value })}
						placeholder="Subject"
					/>
					<Textarea
						value={step.body}
						onChange={(e) => onChange({ ...step, body: e.target.value })}
						rows={4}
					/>
				</div>
			)}
			{step.action === "add_tag" && (
				<Input
					value={step.tag}
					onChange={(e) => onChange({ ...step, tag: e.target.value })}
					placeholder="tag-name"
				/>
			)}
			{step.action === "wait" && (
				<div className="flex items-center gap-2">
					<Input
						type="number"
						min={1}
						value={step.minutes}
						onChange={(e) =>
							onChange({ ...step, minutes: Number(e.target.value) })
						}
						className="w-24"
					/>
					<span className="text-sm text-muted-foreground">minutes</span>
				</div>
			)}
			{step.action === "agent_task" && (
				<Textarea
					value={step.prompt}
					onChange={(e) => onChange({ ...step, prompt: e.target.value })}
					rows={3}
					placeholder="Ask the agent to research this contact and post a brief."
				/>
			)}
		</div>
	);
}
