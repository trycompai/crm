"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import OverflowMenuHorizontal from "@carbon/icons-react/es/OverflowMenuHorizontal";
import { Alert, AlertDescription } from "@crm/ui/components/alert";
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
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc/types";
import {
	workAssignInput,
	workMutationBase,
	workReasonInput,
	workWaitInput,
} from "@/lib/work-action-inputs";
import {
	workAssigneeUsers,
	workspaceMemberSearchInput,
} from "@/lib/work-input";
import {
	canRetryWorkAction,
	rememberWorkActionIntent,
	type WorkActionDescriptor,
	type WorkActionName,
	workActionDescriptors,
	workActionRetryState,
} from "./work-action-descriptors";
import { resetWorkDialogState } from "./work-dialog-state";

type WorkDetail = RouterOutputs["work"]["detail"];
type WorkInputs = RouterInputs["work"];
type WorkUser = { id: string; name: string };
type DialogAction = WorkActionName | null;
type MutationError = {
	message: string;
	data?: { code?: string } | null;
};
type PendingIntent =
	| { action: "claim"; input: WorkInputs["claim"] }
	| { action: "assign"; input: WorkInputs["assign"] }
	| { action: "start"; input: WorkInputs["start"] }
	| { action: "wait"; input: WorkInputs["wait"] }
	| { action: "block"; input: WorkInputs["block"] }
	| { action: "complete"; input: WorkInputs["complete"] }
	| { action: "dismiss"; input: WorkInputs["dismiss"] };

export function WorkActions({
	work,
	users,
}: {
	work: Pick<WorkDetail, "id" | "version" | "owner" | "capabilities">;
	users: readonly WorkUser[];
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [dialogAction, setDialogAction] = useState<DialogAction>(null);
	const [reason, setReason] = useState("");
	const [nextReviewAt, setNextReviewAt] = useState("");
	const [assigneeId, setAssigneeId] = useState(work.owner?.id ?? "unassigned");
	const [assigneeSearch, setAssigneeSearch] = useState("");
	const [lastIntent, setLastIntent] = useState<PendingIntent | null>(null);
	const lastIntentRef = useRef<PendingIntent | null>(null);
	const [status, setStatus] = useState<{
		kind: "success" | "error";
		message: string;
		requestReference?: string;
		retryable?: boolean;
	} | null>(null);

	const resetDialogState = () => {
		const initial = resetWorkDialogState(work.owner?.id);
		setReason(initial.reason);
		setNextReviewAt(initial.nextReviewAt);
		setAssigneeId(initial.assigneeId);
		setAssigneeSearch(initial.assigneeSearch);
	};

	const closeDialog = () => {
		resetDialogState();
		setDialogAction(null);
	};

	const assignmentMembers = useQuery({
		...trpc.workspace.members.queryOptions(
			workspaceMemberSearchInput(assigneeSearch),
		),
		enabled: dialogAction === "assign",
	});
	const assignmentUsers = assignmentMembers.data
		? workAssigneeUsers(assignmentMembers.data.rows)
		: assigneeSearch.trim()
			? []
			: users;

	const invalidate = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: trpc.work.list.pathKey() }),
			queryClient.invalidateQueries({ queryKey: trpc.work.detail.pathKey() }),
		]);
	};

	const onSuccess = async (
		_result: unknown,
		variables: { clientRequestId: string },
	) => {
		lastIntentRef.current = null;
		setLastIntent(null);
		closeDialog();
		setStatus({
			kind: "success",
			message: "Work updated.",
			requestReference: variables.clientRequestId,
		});
		await invalidate();
	};

	const onError = async (error: MutationError) => {
		const retryState = workActionRetryState(
			lastIntentRef.current?.action ?? null,
			error.data?.code,
		);
		if (!retryState.retainIntent) {
			lastIntentRef.current = null;
			setLastIntent(null);
		}
		setStatus({
			kind: "error",
			message: error.message,
			retryable: retryState.retryable,
		});
		await invalidate();
	};

	const claim = useMutation(
		trpc.work.claim.mutationOptions({
			retry: false,
			onSuccess,
			onError,
		}),
	);
	const assign = useMutation(
		trpc.work.assign.mutationOptions({
			retry: false,
			onSuccess,
			onError,
		}),
	);
	const start = useMutation(
		trpc.work.start.mutationOptions({
			retry: false,
			onSuccess,
			onError,
		}),
	);
	const wait = useMutation(
		trpc.work.wait.mutationOptions({
			retry: false,
			onSuccess,
			onError,
		}),
	);
	const block = useMutation(
		trpc.work.block.mutationOptions({
			retry: false,
			onSuccess,
			onError,
		}),
	);
	const complete = useMutation(
		trpc.work.complete.mutationOptions({
			retry: false,
			onSuccess,
			onError,
		}),
	);
	const dismiss = useMutation(
		trpc.work.dismiss.mutationOptions({
			retry: false,
			onSuccess,
			onError,
		}),
	);

	const mutations = {
		claim,
		assign,
		start,
		wait,
		block,
		complete,
		dismiss,
	};
	const descriptors = workActionDescriptors(work.capabilities);
	const primary = descriptors[0];
	const pending = Object.values(mutations).some(
		(mutation) => mutation.isPending,
	);
	const canRetry = canRetryWorkAction({
		action: lastIntent?.action ?? null,
		retryable: status?.kind === "error" && status.retryable === true,
	});

	const makeBaseInput = () =>
		workMutationBase(work.id, work.version, crypto.randomUUID());

	const rememberIntent = (intent: PendingIntent) => {
		rememberWorkActionIntent(lastIntentRef, intent);
		setLastIntent(intent);
	};

	const run = (descriptor: WorkActionDescriptor) => {
		if (descriptor.name === "claim") {
			const intent: PendingIntent = {
				action: "claim",
				input: makeBaseInput(),
			};
			rememberIntent(intent);
			setStatus(null);
			claim.mutate(intent.input);
			return;
		}
		if (descriptor.name === "start") {
			const intent: PendingIntent = {
				action: "start",
				input: makeBaseInput(),
			};
			rememberIntent(intent);
			setStatus(null);
			start.mutate(intent.input);
			return;
		}
		resetDialogState();
		setDialogAction(descriptor.name);
		setStatus(null);
	};

	const submitDialog = () => {
		if (!dialogAction) return;
		if (dialogAction === "complete") {
			const intent: PendingIntent = {
				action: "complete",
				input: makeBaseInput(),
			};
			rememberIntent(intent);
			complete.mutate(intent.input);
			return;
		}
		if (dialogAction === "assign") {
			const intent: PendingIntent = {
				action: "assign",
				input: workAssignInput(
					makeBaseInput(),
					assigneeId === "unassigned" ? null : assigneeId,
				),
			};
			rememberIntent(intent);
			assign.mutate(intent.input);
			return;
		}
		if (!reason.trim()) return;
		if (dialogAction === "wait") {
			const nextReview = new Date(nextReviewAt);
			if (
				!nextReviewAt ||
				!Number.isFinite(nextReview.getTime()) ||
				nextReview <= new Date()
			)
				return;
			const intent: PendingIntent = {
				action: "wait",
				input: workWaitInput(
					makeBaseInput(),
					reason.trim(),
					nextReview.toISOString(),
				),
			};
			rememberIntent(intent);
			wait.mutate(intent.input);
			return;
		}
		const intent: PendingIntent = {
			action: dialogAction,
			input: workReasonInput(makeBaseInput(), reason.trim()),
		};
		rememberIntent(intent);
		if (intent.action === "block") block.mutate(intent.input);
		if (intent.action === "dismiss") dismiss.mutate(intent.input);
	};

	const retryLast = () => {
		const intent = lastIntentRef.current;
		if (!intent) return;
		setStatus(null);
		switch (intent.action) {
			case "assign":
				assign.mutate(intent.input);
				break;
			case "wait":
				wait.mutate(intent.input);
				break;
			case "block":
				block.mutate(intent.input);
				break;
			case "dismiss":
				dismiss.mutate(intent.input);
				break;
			case "complete":
				complete.mutate(intent.input);
				break;
			case "start":
				start.mutate(intent.input);
				break;
			case "claim":
				claim.mutate(intent.input);
				break;
		}
	};

	return (
		<div
			className="flex min-w-0 flex-wrap items-center gap-2"
			aria-busy={pending}
		>
			{primary ? (
				<Button disabled={pending} onClick={() => run(primary)}>
					{pending ? (
						<Spinner data-icon="inline-start" />
					) : (
						<Checkmark data-icon="inline-start" />
					)}
					{primary.label}
				</Button>
			) : null}
			{descriptors.length > 1 ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="icon-sm"
							disabled={pending}
							aria-label="More work actions"
						>
							<OverflowMenuHorizontal />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{descriptors.slice(1).map((descriptor) => (
							<DropdownMenuItem
								key={descriptor.name}
								onSelect={() => run(descriptor)}
							>
								{descriptor.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
			{status?.kind === "success" ? (
				<div
					role="status"
					aria-live="polite"
					aria-atomic="true"
					className="basis-full text-muted-foreground text-xs"
				>
					{status.message} Request reference{" "}
					{status.requestReference?.slice(0, 8)}.
				</div>
			) : null}
			{status?.kind === "error" && dialogAction === null ? (
				<Alert variant="destructive" className="basis-full">
					<AlertDescription className="flex items-center justify-between gap-2">
						<span>{status.message}</span>
						{canRetry ? (
							<Button
								variant="outline"
								size="xs"
								onClick={retryLast}
								disabled={pending}
							>
								Retry
							</Button>
						) : null}
					</AlertDescription>
				</Alert>
			) : null}
			<Dialog
				open={dialogAction !== null}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{dialogAction
								? `${dialogAction.slice(0, 1).toUpperCase()}${dialogAction.slice(1)} work`
								: "Work action"}
						</DialogTitle>
						<DialogDescription>
							Confirm this server-authorized work action.
						</DialogDescription>
					</DialogHeader>
					{status?.kind === "error" && dialogAction !== null ? (
						<Alert variant="destructive" role="alert">
							<AlertDescription className="flex items-center justify-between gap-2">
								<span>{status.message}</span>
								{canRetry ? (
									<Button
										variant="outline"
										size="xs"
										onClick={retryLast}
										disabled={pending}
									>
										Retry
									</Button>
								) : null}
							</AlertDescription>
						</Alert>
					) : null}
					{dialogAction === "assign" ? (
						<div className="flex flex-col gap-3">
							<div className="flex flex-col gap-2">
								<Label htmlFor="work-assignee-search">
									Search workspace members
								</Label>
								<Input
									id="work-assignee-search"
									value={assigneeSearch}
									onChange={(event) => setAssigneeSearch(event.target.value)}
									placeholder="Name or email"
									aria-describedby="work-assignee-search-status"
									disabled={pending}
								/>
								<div
									id="work-assignee-search-status"
									role="status"
									aria-live="polite"
									aria-atomic="true"
									className="text-muted-foreground text-xs"
								>
									{assignmentMembers.isFetching
										? "Searching workspace members…"
										: assignmentMembers.isError
											? "Workspace members could not be loaded."
											: assignmentUsers.length === 0
												? "No workspace members match."
												: `${assignmentUsers.length} workspace members found.`}
								</div>
							</div>
							<Label htmlFor="work-assignee">Assignee</Label>
							<Select value={assigneeId} onValueChange={setAssigneeId}>
								<SelectTrigger id="work-assignee" aria-label="Assignee">
									<SelectValue placeholder="Choose an assignee" />
								</SelectTrigger>
								<SelectContent>
									<SelectLabel>People</SelectLabel>
									<SelectItem value="unassigned">Unassigned</SelectItem>
									{assignmentUsers.map((user) => (
										<SelectItem key={user.id} value={user.id}>
											{user.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : dialogAction === "wait" ? (
						<div className="flex flex-col gap-3">
							<div className="flex flex-col gap-2">
								<Label htmlFor="work-wait-reason">Reason</Label>
								<Textarea
									id="work-wait-reason"
									value={reason}
									onChange={(event) => setReason(event.target.value)}
									required
									aria-required="true"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="work-next-review">Next review</Label>
								<Input
									id="work-next-review"
									type="datetime-local"
									value={nextReviewAt}
									onChange={(event) => setNextReviewAt(event.target.value)}
									required
									aria-required="true"
								/>
							</div>
						</div>
					) : dialogAction === "block" || dialogAction === "dismiss" ? (
						<div className="flex flex-col gap-2">
							<Label htmlFor="work-action-reason">Reason</Label>
							<Textarea
								id="work-action-reason"
								value={reason}
								onChange={(event) => setReason(event.target.value)}
								required
								aria-required="true"
							/>
						</div>
					) : (
						<p className="text-muted-foreground text-xs">
							This is a consequential update to the work item.
						</p>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={closeDialog} disabled={pending}>
							Cancel
						</Button>
						<Button
							onClick={submitDialog}
							disabled={
								pending ||
								(dialogAction !== "assign" &&
									dialogAction !== "complete" &&
									(!reason.trim() ||
										(dialogAction === "wait" &&
											(!nextReviewAt || new Date(nextReviewAt) <= new Date()))))
							}
						>
							Confirm
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
