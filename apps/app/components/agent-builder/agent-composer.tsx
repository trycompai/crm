"use client";

import Add from "@carbon/icons-react/es/Add";
import Application from "@carbon/icons-react/es/Application";
import ArrowUp from "@carbon/icons-react/es/ArrowUp";
import AttachmentIcon from "@carbon/icons-react/es/Attachment";
import Building from "@carbon/icons-react/es/Building";
import Calendar from "@carbon/icons-react/es/Calendar";
import Email from "@carbon/icons-react/es/Email";
import Partnership from "@carbon/icons-react/es/Partnership";
import Search from "@carbon/icons-react/es/Search";
import User from "@carbon/icons-react/es/User";
import {
	AsyncButtonContent,
	useAsyncAction,
} from "@crm/ui/components/async-action";
import { Button } from "@crm/ui/components/button";
import { type CarbonIcon, Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { Skeleton } from "@crm/ui/components/skeleton";
import { SkeletonSwap } from "@crm/ui/components/skeleton-swap";
import { Textarea } from "@crm/ui/components/textarea";
import { cn } from "@crm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useReducer, useRef } from "react";
import { toast } from "sonner";
import {
	type BuilderCommandType,
	builderCommandType,
	consumeBuilderCommand,
	consumeBuilderIntent,
} from "@/lib/agent-builder";
import { useTRPC } from "@/lib/trpc/client";
import { AGENT_COMPOSER_CLASS_NAME } from "../agent-composer-frame";
import {
	ChatAttachmentChip,
	type ChatChipAttachment,
	type ChatChipResource,
	ChatCommandChip,
	ChatReferenceChip,
	ChatReferenceIdentity,
} from "./chat-chips";

export type BuilderResource = ChatChipResource;

export type BuilderUploadAttachment = ChatChipAttachment & {
	id?: never;
	contentBase64: string;
};

export type BuilderStoredAttachment = ChatChipAttachment & {
	id: string;
	contentBase64?: never;
};

export type BuilderAttachment =
	| BuilderUploadAttachment
	| BuilderStoredAttachment;

export type BuilderPrompt<
	TAttachment extends BuilderAttachment = BuilderAttachment,
> = {
	commandType: BuilderCommandType;
	message: string;
	resources: BuilderResource[];
	attachments: TAttachment[];
};

export type BuilderComposerPrompt = BuilderPrompt<BuilderUploadAttachment>;

type PendingSubmission = {
	key: string;
	clientRequestId: string;
};

const CREATE_AGENT_COMMAND = {
	commandType: "CREATE_AGENT" as const,
	invocation: "/Create agent",
	label: "Create agent",
	description: "Build a durable team automation",
};

type ComposerCommand = typeof CREATE_AGENT_COMMAND;

type ComposerState = {
	draft: string;
	command: ComposerCommand | null;
	detectedCommandLabel: string | null;
	commandOpen: boolean;
	resourceQuery: string;
	resources: BuilderResource[];
	attachments: BuilderUploadAttachment[];
	attachmentsReading: boolean;
};

type ComposerAction =
	| { type: "draft.changed"; value: string }
	| { type: "command.selected" }
	| { type: "command.removed" }
	| { type: "command.open.changed"; open: boolean }
	| { type: "resource.query.changed"; value: string }
	| { type: "resource.added"; resource: BuilderResource }
	| { type: "resource.removed"; resource: BuilderResource }
	| { type: "attachments.added"; attachments: BuilderUploadAttachment[] }
	| { type: "attachment.removed"; attachment: BuilderUploadAttachment }
	| { type: "attachments.reading.started" }
	| { type: "attachments.reading.finished" }
	| { type: "submitted" };

function initialComposerState(initialPrompt: string): ComposerState {
	const explicitCommand = consumeBuilderCommand(initialPrompt);
	const detectedIntent = explicitCommand
		? null
		: consumeBuilderIntent(initialPrompt);
	return {
		draft: explicitCommand?.body ?? initialPrompt,
		command: explicitCommand || detectedIntent ? CREATE_AGENT_COMMAND : null,
		detectedCommandLabel: detectedIntent?.invocation ?? null,
		commandOpen: false,
		resourceQuery: "",
		resources: [],
		attachments: [],
		attachmentsReading: false,
	};
}

function composerReducer(
	state: ComposerState,
	action: ComposerAction,
): ComposerState {
	switch (action.type) {
		case "draft.changed": {
			const explicitCommand = consumeBuilderCommand(action.value);
			if (explicitCommand) {
				return {
					...state,
					draft: explicitCommand.body,
					command: CREATE_AGENT_COMMAND,
					detectedCommandLabel: null,
					commandOpen: false,
				};
			}
			const detectedIntent = state.command
				? null
				: consumeBuilderIntent(action.value);
			if (detectedIntent) {
				return {
					...state,
					draft: action.value,
					command: CREATE_AGENT_COMMAND,
					detectedCommandLabel: detectedIntent.invocation,
					commandOpen: false,
				};
			}
			return {
				...state,
				draft: action.value,
				commandOpen: !state.command && action.value.trimStart().startsWith("/"),
			};
		}
		case "command.selected":
			return {
				...state,
				command: CREATE_AGENT_COMMAND,
				detectedCommandLabel: null,
				commandOpen: false,
				draft: state.draft.trimStart().startsWith("/") ? "" : state.draft,
			};
		case "command.removed":
			return {
				...state,
				command: null,
				detectedCommandLabel: null,
			};
		case "command.open.changed":
			return { ...state, commandOpen: action.open };
		case "resource.query.changed":
			return { ...state, resourceQuery: action.value };
		case "resource.added":
			return state.resources.some(
				(item) =>
					item.kind === action.resource.kind && item.id === action.resource.id,
			)
				? state
				: { ...state, resources: [...state.resources, action.resource] };
		case "resource.removed":
			return {
				...state,
				resources: state.resources.filter(
					(item) =>
						item.kind !== action.resource.kind ||
						item.id !== action.resource.id,
				),
			};
		case "attachments.added": {
			const keys = new Set(state.attachments.map(attachmentKey));
			const added = action.attachments.filter((attachment) => {
				const key = attachmentKey(attachment);
				if (keys.has(key)) return false;
				keys.add(key);
				return true;
			});
			if (added.length === 0) return state;
			return {
				...state,
				attachments: [...state.attachments, ...added].slice(0, 5),
			};
		}
		case "attachment.removed":
			return {
				...state,
				attachments: state.attachments.filter(
					(item) => item !== action.attachment,
				),
			};
		case "attachments.reading.started":
			return { ...state, attachmentsReading: true };
		case "attachments.reading.finished":
			return { ...state, attachmentsReading: false };
		case "submitted":
			return {
				...state,
				draft: "",
				command: null,
				detectedCommandLabel: null,
				commandOpen: false,
				resources: [],
				attachments: [],
				attachmentsReading: false,
			};
	}
}

function attachmentKey(attachment: ChatChipAttachment): string {
	if (attachment.id) return attachment.id;
	const existing = attachmentKeys.get(attachment);
	if (existing) return existing;
	const key = crypto.randomUUID();
	attachmentKeys.set(attachment, key);
	return key;
}

const attachmentKeys = new WeakMap<ChatChipAttachment, string>();

export function AgentComposer({
	mode,
	disabled = false,
	initialPrompt = "",
	onSubmit,
}: {
	mode: "home" | "chat";
	disabled?: boolean;
	initialPrompt?: string;
	onSubmit: (
		prompt: BuilderComposerPrompt,
		clientRequestId: string,
	) => Promise<void>;
}) {
	const trpc = useTRPC();
	const pendingSubmission = useRef<PendingSubmission | null>(null);
	const [state, dispatch] = useReducer(
		composerReducer,
		initialPrompt,
		initialComposerState,
	);
	const resourceResults = useQuery(
		trpc.conversations.builderResources.queryOptions({
			q: state.resourceQuery,
		}),
	);
	const google = useQuery(trpc.google.status.queryOptions());
	const submitAction = useAsyncAction({
		action: onSubmit,
		onSuccess: () => {
			pendingSubmission.current = null;
			dispatch({ type: "submitted" });
		},
	});
	const locked = disabled || submitAction.pending;
	const canSend =
		state.draft.trim().length > 0 && !locked && !state.attachmentsReading;

	const submit = () => {
		if (!canSend) return;
		const body = state.draft.trim();
		const message =
			state.command && !state.detectedCommandLabel
				? `${state.command.invocation} ${body}`
				: body;
		const prompt = {
			commandType: state.command?.commandType ?? builderCommandType(message),
			message,
			resources: state.resources,
			attachments: state.attachments,
		};
		const key = JSON.stringify(prompt);
		const pending = pendingSubmission.current;
		const clientRequestId =
			pending?.key === key ? pending.clientRequestId : crypto.randomUUID();
		pendingSubmission.current = { key, clientRequestId };
		submitAction.run(prompt, clientRequestId);
	};

	const connectedGoogle = (google.data?.sources ?? []).filter(
		(source) => source.connected,
	);

	return (
		<div
			className={cn(
				AGENT_COMPOSER_CLASS_NAME,
				mode === "home" ? "min-h-24" : "min-h-[78px]",
			)}
		>
			<ComposerContext
				command={state.command}
				resources={state.resources}
				attachments={state.attachments}
				disabled={locked}
				dispatch={dispatch}
			/>

			<ComposerTextarea
				mode={mode}
				value={state.draft}
				detectedIntent={state.detectedCommandLabel}
				onChange={(value) => dispatch({ type: "draft.changed", value })}
				disabled={locked}
				onSubmit={submit}
			/>

			<div className="flex h-7 items-center justify-between">
				<ComposerTools
					state={state}
					resources={resourceResults.data ?? []}
					resourcesLoading={resourceResults.isFetching}
					resourcesReady={resourceResults.isSuccess}
					connectedGoogle={connectedGoogle}
					disabled={locked}
					attachmentsReading={state.attachmentsReading}
					dispatch={dispatch}
				/>

				<Button
					variant="default"
					size="icon-sm"
					disabled={!canSend}
					aria-busy={submitAction.pending || state.attachmentsReading}
					aria-label={
						state.attachmentsReading ? "Preparing attachments" : "Send message"
					}
					onClick={submit}
					className="rounded-full"
				>
					<AsyncButtonContent
						status={state.attachmentsReading ? "pending" : submitAction.status}
						pendingLabel={
							<span className="sr-only">
								{state.attachmentsReading ? "Preparing attachments" : "Sending"}
							</span>
						}
						successLabel={<span className="sr-only">Sent</span>}
						errorLabel={<span className="sr-only">Send failed</span>}
					>
						<Icon icon={ArrowUp} />
					</AsyncButtonContent>
				</Button>
			</div>
		</div>
	);
}

function ComposerTextarea({
	mode,
	value,
	detectedIntent,
	disabled,
	onChange,
	onSubmit,
}: {
	mode: "home" | "chat";
	value: string;
	detectedIntent: string | null;
	disabled: boolean;
	onChange: (value: string) => void;
	onSubmit: () => void;
}) {
	const emphasis = useRef<HTMLDivElement>(null);
	const intentStart = detectedIntent ? value.indexOf(detectedIntent) : -1;
	const showEmphasis = detectedIntent !== null && intentStart >= 0;

	return (
		<div className="relative grid">
			{showEmphasis ? (
				<div
					ref={emphasis}
					data-intent-overlay
					aria-hidden
					className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border border-transparent px-1 py-0 text-base leading-6 sm:text-[15px] md:text-xs"
				>
					<span>{value.slice(0, intentStart)}</span>
					<span data-intent-trigger className="relative">
						{detectedIntent}
						<span
							data-intent-accent
							className="absolute inset-x-0 bottom-0 h-px origin-left animate-in bg-primary duration-200 ease-out zoom-in-0 motion-reduce:animate-none"
						/>
					</span>
					<span>{value.slice(intentStart + detectedIntent.length)}</span>
				</div>
			) : null}
			<Textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onScroll={(event) => {
					if (!emphasis.current) return;
					emphasis.current.style.translate = `${-event.currentTarget.scrollLeft}px ${-event.currentTarget.scrollTop}px`;
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						onSubmit();
					}
				}}
				disabled={disabled}
				rows={mode === "home" ? 2 : 1}
				variant="composer"
				size="composer"
				placeholder={
					mode === "home"
						? "Ask about your CRM or automate a task…"
						: "Send a message"
				}
				aria-label="Message the agent builder"
				className={cn(
					"relative",
					showEmphasis && "text-transparent caret-foreground",
				)}
			/>
		</div>
	);
}

function ComposerContext({
	command,
	resources,
	attachments,
	disabled,
	dispatch,
}: {
	command: ComposerCommand | null;
	resources: BuilderResource[];
	attachments: BuilderUploadAttachment[];
	disabled: boolean;
	dispatch: React.Dispatch<ComposerAction>;
}) {
	if (!command && resources.length === 0 && attachments.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap gap-1 px-1 pb-1">
			{command ? (
				<ChatCommandChip
					label={command.label}
					icon={Application}
					onRemove={
						disabled ? undefined : () => dispatch({ type: "command.removed" })
					}
				/>
			) : null}
			{resources.map((resource) => (
				<ChatReferenceChip
					key={`${resource.kind}:${resource.id}`}
					resource={resource}
					icon={RESOURCE_ICONS[resource.kind]}
					onRemove={
						disabled
							? undefined
							: () => dispatch({ type: "resource.removed", resource })
					}
				/>
			))}
			{attachments.map((attachment) => (
				<ChatAttachmentChip
					key={attachmentKey(attachment)}
					attachment={attachment}
					onRemove={
						disabled
							? undefined
							: () => dispatch({ type: "attachment.removed", attachment })
					}
				/>
			))}
		</div>
	);
}

function ComposerTools({
	state,
	resources,
	resourcesLoading,
	resourcesReady,
	connectedGoogle,
	disabled,
	attachmentsReading,
	dispatch,
}: {
	state: ComposerState;
	resources: BuilderResource[];
	resourcesLoading: boolean;
	resourcesReady: boolean;
	connectedGoogle: Array<{ source: string }>;
	disabled: boolean;
	attachmentsReading: boolean;
	dispatch: React.Dispatch<ComposerAction>;
}) {
	return (
		<div className="flex items-center gap-0.5">
			<ResourcePicker
				query={state.resourceQuery}
				resources={resources}
				loading={resourcesLoading}
				ready={resourcesReady}
				connectedGoogle={connectedGoogle}
				disabled={disabled}
				dispatch={dispatch}
			/>
			<AttachmentPicker
				disabled={disabled || attachmentsReading}
				dispatch={dispatch}
			/>
			<CommandPicker
				open={state.commandOpen}
				disabled={disabled}
				dispatch={dispatch}
			/>
		</div>
	);
}

function ResourcePicker({
	query,
	resources,
	loading,
	ready,
	connectedGoogle,
	disabled,
	dispatch,
}: {
	query: string;
	resources: BuilderResource[];
	loading: boolean;
	ready: boolean;
	connectedGoogle: Array<{ source: string }>;
	disabled: boolean;
	dispatch: React.Dispatch<ComposerAction>;
}) {
	const add = (resource: BuilderResource) =>
		dispatch({ type: "resource.added", resource });

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Tag CRM records and integrations"
					disabled={disabled}
				>
					<Icon icon={Add} />
				</Button>
			</PopoverTrigger>
			<PopoverContent size="fit" align="start" side="top" className="w-80">
				<div className="border-b p-2">
					<div className="relative">
						<Icon
							icon={Search}
							className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							value={query}
							onChange={(event) =>
								dispatch({
									type: "resource.query.changed",
									value: event.target.value,
								})
							}
							placeholder="Search CRM records"
							aria-label="Search CRM records"
							disabled={disabled}
							className="pl-8"
						/>
					</div>
				</div>
				<div className="max-h-72 overflow-y-auto p-1">
					{connectedGoogle.map((source) => {
						const calendar = source.source === "calendar";
						const label = calendar ? "Google Calendar" : "Gmail";
						return (
							<ResourceButton
								key={source.source}
								icon={calendar ? Calendar : Email}
								label={label}
								detail="Connected integration"
								disabled={disabled}
								onSelect={() =>
									add({
										kind: "integration",
										id: `google:${source.source}`,
										label,
										detail: "Connected integration",
										imageUrl: null,
									})
								}
							/>
						);
					})}
					<SkeletonSwap
						loading={loading}
						label="CRM records"
						skeleton={<ResourceResultsSkeleton />}
					>
						{resources.map((resource) => (
							<ResourceButton
								key={`${resource.kind}:${resource.id}`}
								icon={RESOURCE_ICONS[resource.kind]}
								label={resource.label}
								detail={resource.detail ?? RESOURCE_LABELS[resource.kind]}
								disabled={disabled}
								imageUrl={resource.imageUrl}
								onSelect={() => add(resource)}
							/>
						))}
						{ready && connectedGoogle.length === 0 && resources.length === 0 ? (
							<p className="px-3 py-5 text-center text-muted-foreground text-xs">
								No matching records.
							</p>
						) : null}
					</SkeletonSwap>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function AttachmentPicker({
	disabled,
	dispatch,
}: {
	disabled: boolean;
	dispatch: React.Dispatch<ComposerAction>;
}) {
	const input = useRef<HTMLInputElement>(null);
	const addFiles = async (files: FileList | null) => {
		if (!files || files.length === 0) return;
		dispatch({ type: "attachments.reading.started" });
		try {
			const attachments = await readFiles(files);
			dispatch({ type: "attachments.added", attachments });
		} catch {
			toast.error("Those files could not be attached. Try again.");
		} finally {
			dispatch({ type: "attachments.reading.finished" });
		}
	};

	return (
		<>
			<input
				ref={input}
				type="file"
				multiple
				disabled={disabled}
				className="hidden"
				onChange={(event) => {
					void addFiles(event.currentTarget.files);
					event.currentTarget.value = "";
				}}
			/>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Attach files"
				disabled={disabled}
				onClick={() => input.current?.click()}
			>
				<Icon icon={AttachmentIcon} />
			</Button>
		</>
	);
}

function CommandPicker({
	open,
	disabled,
	dispatch,
}: {
	open: boolean;
	disabled: boolean;
	dispatch: React.Dispatch<ComposerAction>;
}) {
	return (
		<Popover
			open={disabled ? false : open}
			onOpenChange={(next) =>
				dispatch({ type: "command.open.changed", open: next })
			}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Open slash commands"
					disabled={disabled}
					className="font-mono text-sm"
				>
					/
				</Button>
			</PopoverTrigger>
			<PopoverContent size="fit" align="start" side="top" className="w-64 p-1">
				<button
					type="button"
					onClick={() => dispatch({ type: "command.selected" })}
					className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted"
					disabled={disabled}
				>
					<Icon icon={Application} className="size-4 text-muted-foreground" />
					<span>
						<span className="block font-medium text-xs">
							/{CREATE_AGENT_COMMAND.label}
						</span>
						<span className="block text-muted-foreground text-xs">
							{CREATE_AGENT_COMMAND.description}
						</span>
					</span>
				</button>
			</PopoverContent>
		</Popover>
	);
}

function ResourceResultsSkeleton() {
	return (
		<div className="flex flex-col gap-1 px-3 py-2">
			{["first", "second", "third"].map((item) => (
				<div key={item} className="flex h-10 items-center gap-3">
					<Skeleton className="size-6 shrink-0" />
					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						<Skeleton className="h-3 w-2/3" />
						<Skeleton className="h-2.5 w-1/3" />
					</div>
				</div>
			))}
		</div>
	);
}

const RESOURCE_ICONS: Record<BuilderResource["kind"], CarbonIcon> = {
	integration: Application,
	company: Building,
	contact: User,
	deal: Partnership,
};

const RESOURCE_LABELS: Record<BuilderResource["kind"], string> = {
	integration: "Integration",
	company: "Company",
	contact: "Contact",
	deal: "Deal",
};

function ResourceButton({
	icon,
	label,
	detail,
	imageUrl,
	disabled,
	onSelect,
}: {
	icon: CarbonIcon;
	label: string;
	detail: string | null;
	imageUrl?: string | null;
	disabled: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			disabled={disabled}
			className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted"
		>
			<ChatReferenceIdentity
				resource={{
					kind: "integration",
					id: label,
					label,
					detail,
					imageUrl,
				}}
				icon={icon}
			/>
		</button>
	);
}

async function readFiles(
	files: FileList | null,
): Promise<BuilderUploadAttachment[]> {
	if (!files) return [];
	const acceptedFiles: File[] = [];

	for (const file of Array.from(files).slice(0, 5)) {
		if (file.size === 0) {
			toast.error(`${file.name} is empty.`);
			continue;
		}
		if (file.size > 2_000_000) {
			toast.error(`${file.name} is larger than 2 MB.`);
			continue;
		}
		if (file.name.length > 180) {
			toast.error("That file name is too long.");
			continue;
		}
		if (file.type.length > 120) {
			toast.error(`${file.name} has an unsupported file type.`);
			continue;
		}
		acceptedFiles.push(file);
	}

	const attachments = await Promise.all(
		acceptedFiles.map(async (file): Promise<BuilderUploadAttachment | null> => {
			try {
				return {
					name: file.name,
					type: file.type || "application/octet-stream",
					size: file.size,
					contentBase64: bytesToBase64(
						new Uint8Array(await file.arrayBuffer()),
					),
				};
			} catch {
				toast.error(`${file.name} could not be read.`);
				return null;
			}
		}),
	);

	return attachments.filter(
		(attachment): attachment is BuilderUploadAttachment => attachment !== null,
	);
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let index = 0; index < bytes.length; index += 8192) {
		binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
	}
	return btoa(binary);
}
