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

type FieldDraft = {
	id: string;
	key: string;
	label: string;
	type: "TEXT" | "EMAIL" | "PHONE" | "LONG_TEXT" | "NUMBER";
	required: boolean;
};

const nextId = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_FIELDS: FieldDraft[] = [
	{ id: nextId(), key: "name", label: "Name", type: "TEXT", required: true },
	{ id: nextId(), key: "email", label: "Email", type: "EMAIL", required: true },
	{
		id: nextId(),
		key: "phone",
		label: "Phone",
		type: "PHONE",
		required: false,
	},
	{
		id: nextId(),
		key: "message",
		label: "Message",
		type: "LONG_TEXT",
		required: false,
	},
];

export function CreateFormSheet({ trigger }: { trigger?: ReactNode }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [fields, setFields] = useState<FieldDraft[]>(DEFAULT_FIELDS);

	const create = useMutation(
		trpc.forms.create.mutationOptions({
			onSuccess: async () => {
				toast.success("Form created (as draft)");
				setOpen(false);
				setName("");
				setDescription("");
				setFields(DEFAULT_FIELDS);
				await queryClient.invalidateQueries({
					queryKey: trpc.forms.list.queryKey(),
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
			createDeal: false,
			fields: fields.map((f, i) => ({
				key: f.key,
				label: f.label,
				type: f.type,
				required: f.required,
				options: [],
				position: i,
			})),
		});
	}

	function setField(i: number, patch: Partial<FieldDraft>) {
		setFields((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));
	}

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				{trigger ?? <Button>New form</Button>}
			</SheetTrigger>
			<SheetContent side="right" className="w-full sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>New form</SheetTitle>
					<SheetDescription>
						Simple lead-capture form. Publish it, then embed the public URL.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 px-4">
					<div className="grid gap-1.5">
						<Label>Name</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Contact us"
						/>
					</div>
					<div className="grid gap-1.5">
						<Label>Description</Label>
						<Textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
							placeholder="Optional"
						/>
					</div>
					<div>
						<div className="mb-2 flex items-center justify-between">
							<Label>Fields</Label>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() =>
									setFields((prev) => [
										...prev,
										{
											id: nextId(),
											key: `field_${prev.length + 1}`,
											label: "New field",
											type: "TEXT",
											required: false,
										},
									])
								}
							>
								+ Add field
							</Button>
						</div>
						<div className="grid gap-2">
							{fields.map((f, i) => (
								<div
									key={f.id}
									className="grid grid-cols-[1fr_1fr_120px_auto] items-center gap-2 rounded-md border p-2"
								>
									<Input
										value={f.label}
										onChange={(e) => setField(i, { label: e.target.value })}
										placeholder="Label"
									/>
									<Input
										value={f.key}
										onChange={(e) =>
											setField(i, {
												key: e.target.value.replace(/[^a-z0-9_]/gi, ""),
											})
										}
										placeholder="key"
										className="font-mono text-xs"
									/>
									<Select
										value={f.type}
										onValueChange={(v) =>
											setField(i, { type: v as FieldDraft["type"] })
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="TEXT">Text</SelectItem>
											<SelectItem value="EMAIL">Email</SelectItem>
											<SelectItem value="PHONE">Phone</SelectItem>
											<SelectItem value="LONG_TEXT">Long text</SelectItem>
											<SelectItem value="NUMBER">Number</SelectItem>
										</SelectContent>
									</Select>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onClick={() =>
											setFields((prev) => prev.filter((_, j) => j !== i))
										}
									>
										Remove
									</Button>
								</div>
							))}
						</div>
					</div>
				</div>
				<SheetFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button onClick={submit} disabled={!name.trim() || create.isPending}>
						{create.isPending ? "Creating…" : "Create form"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
