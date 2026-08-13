"use client";

import Bullhorn from "@carbon/icons-react/es/Bullhorn";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

type Mode = "send" | "enrol" | null;

export function ContactMarketingActions({
	contactId,
	hasEmail,
}: {
	contactId: string;
	hasEmail: boolean;
}) {
	const trpc = useTRPC();
	const [mode, setMode] = useState<Mode>(null);
	const [templateId, setTemplateId] = useState("");
	const [campaignId, setCampaignId] = useState("");

	const templates = useQuery({
		...trpc.marketingTemplates.options.queryOptions(),
		enabled: mode === "send",
	});

	const campaigns = useQuery({
		...trpc.marketingCampaigns.list.queryOptions({
			q: "",
			sort: "updatedAt",
			dir: "desc",
			page: 1,
			pageSize: 50,
			kind: "DRIP",
			status: "",
		}),
		enabled: mode === "enrol",
	});

	const live = (campaigns.data?.rows ?? []).filter(
		(row) => row.status === "ACTIVE",
	);

	const send = useMutation(
		trpc.marketingCampaigns.sendDirect.mutationOptions({
			onSuccess: () => {
				toast.success("Queued. It goes out within a minute.");
				setMode(null);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const enrol = useMutation(
		trpc.marketingCampaigns.enrol.mutationOptions({
			onSuccess: () => {
				toast.success("Enrolled. The first touch goes on the next tick.");
				setMode(null);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!hasEmail) return null;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm">
						<Icon icon={Bullhorn} data-icon="inline-start" />
						<span className="hidden sm:inline">Marketing</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => setMode("send")}>
						Send an email
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setMode("enrol")}>
						Enrol in a sequence
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog
				open={mode === "send"}
				onOpenChange={(open) => !open && setMode(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Send an email</DialogTitle>
						<DialogDescription>
							This is marketing mail like any other: it gets your header, your
							footer and the unsubscribe link, and it is refused if they have
							unsubscribed.
						</DialogDescription>
					</DialogHeader>

					<Field>
						<FieldLabel htmlFor="direct-template">Template</FieldLabel>
						<Select value={templateId} onValueChange={setTemplateId}>
							<SelectTrigger id="direct-template">
								<SelectValue placeholder="Choose a template" />
							</SelectTrigger>
							<SelectContent>
								{(templates.data ?? []).map((template) => (
									<SelectItem key={template.id} value={template.id}>
										{template.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					<DialogFooter>
						<Button variant="outline" onClick={() => setMode(null)}>
							Cancel
						</Button>
						<Button
							disabled={!templateId || send.isPending}
							onClick={() => send.mutate({ contactId, templateId })}
						>
							{send.isPending ? <Spinner /> : null}
							Send
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={mode === "enrol"}
				onOpenChange={(open) => !open && setMode(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Enrol in a sequence</DialogTitle>
						<DialogDescription>
							Only campaigns somebody has already activated are listed.
						</DialogDescription>
					</DialogHeader>

					<Field>
						<FieldLabel htmlFor="enrol-campaign">Campaign</FieldLabel>
						<Select value={campaignId} onValueChange={setCampaignId}>
							<SelectTrigger id="enrol-campaign">
								<SelectValue
									placeholder={
										live.length === 0
											? "No live sequences"
											: "Choose a sequence"
									}
								/>
							</SelectTrigger>
							<SelectContent>
								{live.map((campaign) => (
									<SelectItem key={campaign.id} value={campaign.id}>
										{campaign.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					<DialogFooter>
						<Button variant="outline" onClick={() => setMode(null)}>
							Cancel
						</Button>
						<Button
							disabled={!campaignId || enrol.isPending}
							onClick={() => enrol.mutate({ campaignId, contactId })}
						>
							{enrol.isPending ? <Spinner /> : null}
							Enrol
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

export function CompanyMarketingActions({
	companyId,
	people,
}: {
	companyId: string;
	people: number;
}) {
	const trpc = useTRPC();
	const [mode, setMode] = useState<Mode>(null);
	const [templateId, setTemplateId] = useState("");
	const [campaignId, setCampaignId] = useState("");

	const templates = useQuery({
		...trpc.marketingTemplates.options.queryOptions(),
		enabled: mode === "send",
	});

	const campaigns = useQuery({
		...trpc.marketingCampaigns.list.queryOptions({
			q: "",
			sort: "updatedAt",
			dir: "desc",
			page: 1,
			pageSize: 50,
			kind: "DRIP",
			status: "",
		}),
		enabled: mode === "enrol",
	});

	const live = (campaigns.data?.rows ?? []).filter(
		(row) => row.status === "ACTIVE",
	);

	const send = useMutation(
		trpc.marketingCampaigns.sendCompany.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					`Queued ${result.queued} of ${result.total}. It goes out within a minute.`,
				);
				setMode(null);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const enrol = useMutation(
		trpc.marketingCampaigns.enrolCompany.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					`Enrolled ${result.enrolled} of ${result.total}. The first touch goes on the next tick.`,
				);
				setMode(null);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (people === 0) return null;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm">
						<Icon icon={Bullhorn} data-icon="inline-start" />
						<span className="hidden sm:inline">Marketing</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => setMode("send")}>
						Send an email to everybody here
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setMode("enrol")}>
						Enrol everybody in a sequence
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog
				open={mode === "send"}
				onOpenChange={(open) => !open && setMode(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Send an email to everybody here</DialogTitle>
						<DialogDescription>
							It goes to every contact at this company that has an address.
							Anybody who unsubscribed or bounced is skipped, and the count says
							how many.
						</DialogDescription>
					</DialogHeader>

					<Field>
						<FieldLabel htmlFor="company-template">Template</FieldLabel>
						<Select value={templateId} onValueChange={setTemplateId}>
							<SelectTrigger id="company-template">
								<SelectValue placeholder="Choose a template" />
							</SelectTrigger>
							<SelectContent>
								{(templates.data ?? []).map((template) => (
									<SelectItem key={template.id} value={template.id}>
										{template.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					<DialogFooter>
						<Button variant="outline" onClick={() => setMode(null)}>
							Cancel
						</Button>
						<Button
							disabled={!templateId || send.isPending}
							onClick={() => send.mutate({ companyId, templateId })}
						>
							{send.isPending ? <Spinner /> : null}
							Send
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={mode === "enrol"}
				onOpenChange={(open) => !open && setMode(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Enrol everybody in a sequence</DialogTitle>
						<DialogDescription>
							Only campaigns somebody has already activated are listed.
						</DialogDescription>
					</DialogHeader>

					<Field>
						<FieldLabel htmlFor="company-campaign">Campaign</FieldLabel>
						<Select value={campaignId} onValueChange={setCampaignId}>
							<SelectTrigger id="company-campaign">
								<SelectValue
									placeholder={
										live.length === 0
											? "No live sequences"
											: "Choose a sequence"
									}
								/>
							</SelectTrigger>
							<SelectContent>
								{live.map((campaign) => (
									<SelectItem key={campaign.id} value={campaign.id}>
										{campaign.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					<DialogFooter>
						<Button variant="outline" onClick={() => setMode(null)}>
							Cancel
						</Button>
						<Button
							disabled={!campaignId || enrol.isPending}
							onClick={() => enrol.mutate({ campaignId, companyId })}
						>
							{enrol.isPending ? <Spinner /> : null}
							Enrol
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
