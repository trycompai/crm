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
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { Skeleton } from "@crm/ui/components/skeleton";
import { SkeletonSwap } from "@crm/ui/components/skeleton-swap";
import { TokenField } from "@crm/ui/components/token-field";
import { cn } from "@crm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useReducer, useRef } from "react";
import { flushSync } from "react-dom";
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
};

type ComposerCommand = typeof CREATE_AGENT_COMMAND;

type ComposerAnchor = {
	key: string;
	offset: number;
	order: number;
};

type ComposerState = {
	draft: string;
	command: ComposerCommand | null;
	detectedCommandLabel: string | null;
	commandOpen: boolean;
	resourceOpen: boolean;
	resourceQuery: string;
	resources: BuilderResource[];
	attachments: BuilderUploadAttachment[];
	attachmentsReading: boolean;
	anchors: ComposerAnchor[];
	nextAnchorOrder: number;
};

type ComposerAction =
	| { type: "editor.changed"; value: string; anchors: ComposerAnchor[] }
	| { type: "command.selected"; offset: number }
	| { type: "context.removed"; key: string }
	| { type: "command.open.changed"; open: boolean }
	| { type: "resource.open.changed"; open: boolean }
	| { type: "resource.query.changed"; value: string }
	| { type: "resource.added"; resource: BuilderResource; offset: number }
	| {
			type: "attachments.added";
			attachments: BuilderUploadAttachment[];
			offset: number;
	  }
	| { type: "attachments.reading.started" }
	| { type: "attachments.reading.finished" }
	| { type: "submitted" };

const COMMAND_CONTEXT_KEY = "command:create-agent";
const EDITOR_SENTINEL = "\u200B";

function resourceContextKey(resource: BuilderResource): string {
	return `resource:${resource.kind}:${resource.id}`;
}

function attachmentContextKey(attachment: ChatChipAttachment): string {
	return `attachment:${attachmentKey(attachment)}`;
}

function clampAnchor(anchor: ComposerAnchor, length: number): ComposerAnchor {
	return { ...anchor, offset: Math.max(0, Math.min(anchor.offset, length)) };
}

function withAnchor(
	state: ComposerState,
	key: string,
	offset: number,
): Pick<ComposerState, "anchors" | "nextAnchorOrder"> {
	if (state.anchors.some((anchor) => anchor.key === key)) {
		return {
			anchors: state.anchors,
			nextAnchorOrder: state.nextAnchorOrder,
		};
	}
	return {
		anchors: [
			...state.anchors,
			clampAnchor(
				{ key, offset, order: state.nextAnchorOrder },
				state.draft.length,
			),
		],
		nextAnchorOrder: state.nextAnchorOrder + 1,
	};
}

function withoutContext(state: ComposerState, key: string): ComposerState {
	return {
		...state,
		command: key === COMMAND_CONTEXT_KEY ? null : state.command,
		detectedCommandLabel:
			key === COMMAND_CONTEXT_KEY ? null : state.detectedCommandLabel,
		resources: state.resources.filter(
			(resource) => resourceContextKey(resource) !== key,
		),
		attachments: state.attachments.filter(
			(attachment) => attachmentContextKey(attachment) !== key,
		),
		anchors: state.anchors.filter((anchor) => anchor.key !== key),
	};
}

function initialComposerState(initialPrompt: string): ComposerState {
	const explicitCommand = consumeBuilderCommand(initialPrompt);
	const detectedIntent = explicitCommand
		? null
		: consumeBuilderIntent(initialPrompt);
	const draft = explicitCommand?.body ?? initialPrompt;
	const commandOffset = explicitCommand
		? 0
		: detectedIntent
			? initialPrompt.indexOf(detectedIntent.invocation) +
				detectedIntent.invocation.length
			: null;
	return {
		draft,
		command: explicitCommand || detectedIntent ? CREATE_AGENT_COMMAND : null,
		detectedCommandLabel: detectedIntent?.invocation ?? null,
		commandOpen: false,
		resourceOpen: false,
		resourceQuery: "",
		resources: [],
		attachments: [],
		attachmentsReading: false,
		anchors:
			commandOffset === null
				? []
				: [
						{
							key: COMMAND_CONTEXT_KEY,
							offset: Math.max(0, commandOffset),
							order: 0,
						},
					],
		nextAnchorOrder: commandOffset === null ? 0 : 1,
	};
}

function composerReducer(
	state: ComposerState,
	action: ComposerAction,
): ComposerState {
	switch (action.type) {
		case "editor.changed": {
			const presentKeys = new Set(action.anchors.map((anchor) => anchor.key));
			const retainedCommand =
				state.command && presentKeys.has(COMMAND_CONTEXT_KEY)
					? state.command
					: null;
			const retainedResources = state.resources.filter((resource) =>
				presentKeys.has(resourceContextKey(resource)),
			);
			const retainedAttachments = state.attachments.filter((attachment) =>
				presentKeys.has(attachmentContextKey(attachment)),
			);
			const anchors = action.anchors.map((anchor) =>
				clampAnchor(anchor, action.value.length),
			);
			const explicitCommand = consumeBuilderCommand(action.value);
			if (!retainedCommand && explicitCommand) {
				const bodyStart = action.value.length - explicitCommand.body.length;
				const shiftedAnchors = anchors.map((anchor) =>
					clampAnchor(
						{ ...anchor, offset: anchor.offset - bodyStart },
						explicitCommand.body.length,
					),
				);
				return {
					...state,
					draft: explicitCommand.body,
					command: CREATE_AGENT_COMMAND,
					detectedCommandLabel: null,
					commandOpen: false,
					resources: retainedResources,
					attachments: retainedAttachments,
					anchors: [
						...shiftedAnchors,
						{
							key: COMMAND_CONTEXT_KEY,
							offset: 0,
							order: state.nextAnchorOrder,
						},
					],
					nextAnchorOrder: state.nextAnchorOrder + 1,
				};
			}
			const detectedIntent = retainedCommand
				? null
				: consumeBuilderIntent(action.value);
			if (detectedIntent) {
				const intentStart = action.value.indexOf(detectedIntent.invocation);
				return {
					...state,
					draft: action.value,
					command: CREATE_AGENT_COMMAND,
					detectedCommandLabel: detectedIntent.invocation,
					commandOpen: false,
					resources: retainedResources,
					attachments: retainedAttachments,
					anchors: [
						...anchors,
						{
							key: COMMAND_CONTEXT_KEY,
							offset: Math.max(
								0,
								intentStart + detectedIntent.invocation.length,
							),
							order: state.nextAnchorOrder,
						},
					],
					nextAnchorOrder: state.nextAnchorOrder + 1,
				};
			}
			return {
				...state,
				draft: action.value,
				command: retainedCommand,
				detectedCommandLabel: retainedCommand
					? state.detectedCommandLabel
					: null,
				commandOpen:
					!retainedCommand && action.value.trimStart().startsWith("/"),
				resources: retainedResources,
				attachments: retainedAttachments,
				anchors,
			};
		}
		case "command.selected": {
			const clearsSlash = state.draft.trimStart().startsWith("/");
			const draft = clearsSlash ? "" : state.draft;
			const anchorState = withAnchor(
				{ ...state, draft },
				COMMAND_CONTEXT_KEY,
				clearsSlash ? 0 : action.offset,
			);
			return {
				...state,
				...anchorState,
				command: CREATE_AGENT_COMMAND,
				detectedCommandLabel: null,
				commandOpen: false,
				draft,
			};
		}
		case "context.removed":
			return withoutContext(state, action.key);
		case "command.open.changed":
			return { ...state, commandOpen: action.open };
		case "resource.open.changed":
			return { ...state, resourceOpen: action.open };
		case "resource.query.changed":
			return { ...state, resourceQuery: action.value };
		case "resource.added": {
			const key = resourceContextKey(action.resource);
			return state.resources.some(
				(item) =>
					item.kind === action.resource.kind && item.id === action.resource.id,
			)
				? state
				: {
						...state,
						...withAnchor(state, key, action.offset),
						resources: [...state.resources, action.resource],
					};
		}
		case "attachments.added": {
			const keys = new Set(state.attachments.map(attachmentKey));
			const added = action.attachments.filter((attachment) => {
				const key = attachmentKey(attachment);
				if (keys.has(key)) return false;
				keys.add(key);
				return true;
			});
			if (added.length === 0) return state;
			const accepted = added.slice(0, 5 - state.attachments.length);
			const addedAnchors = accepted.map((attachment, index) => ({
				key: attachmentContextKey(attachment),
				offset: Math.max(0, Math.min(action.offset, state.draft.length)),
				order: state.nextAnchorOrder + index,
			}));
			return {
				...state,
				attachments: [...state.attachments, ...accepted],
				anchors: [...state.anchors, ...addedAnchors],
				nextAnchorOrder: state.nextAnchorOrder + accepted.length,
			};
		}
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
				resourceOpen: false,
				resourceQuery: "",
				resources: [],
				attachments: [],
				attachmentsReading: false,
				anchors: [],
				nextAnchorOrder: 0,
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
	const editor = useRef<HTMLDivElement>(null);
	const selectionOffset = useRef(initialPrompt.length);
	const composing = useRef(false);
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
	const focusAfterContext = (key: string) => {
		let attempts = 0;
		const focus = () => {
			const offset = focusEditorAfterContext(editor.current, key);
			if (offset !== null) {
				selectionOffset.current = offset;
				return;
			}
			attempts += 1;
			if (attempts < 3) requestAnimationFrame(focus);
		};
		requestAnimationFrame(focus);
	};
	const updateEditor = (snapshot: ComposerEditorSnapshot) => {
		flushSync(() => {
			dispatch({
				type: "editor.changed",
				value: snapshot.value,
				anchors: snapshot.anchors,
			});
		});
		selectionOffset.current = snapshot.selectionOffset;
		focusEditorAtOffset(editor.current, snapshot.selectionOffset);
	};
	const removeContext = (key: string) => {
		flushSync(() => dispatch({ type: "context.removed", key }));
		focusEditorAtOffset(editor.current, selectionOffset.current);
	};

	return (
		<div
			className={cn(
				AGENT_COMPOSER_CLASS_NAME,
				mode === "home" ? "min-h-24" : "min-h-[78px]",
			)}
		>
			<ComposerEditor
				editorRef={editor}
				composingRef={composing}
				mode={mode}
				state={state}
				disabled={locked}
				onChanged={updateEditor}
				onSelectionChanged={(offset) => {
					selectionOffset.current = offset;
				}}
				onRemoveContext={removeContext}
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
					getInsertionOffset={() => selectionOffset.current}
					onContextAdded={focusAfterContext}
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

type ComposerEditorSnapshot = {
	value: string;
	anchors: ComposerAnchor[];
	selectionOffset: number;
};

type ComposerEditorPart =
	| { type: "text"; key: string; start: number; value: string }
	| { type: "context"; anchor: ComposerAnchor };

function ComposerEditor({
	editorRef,
	composingRef,
	mode,
	state,
	disabled,
	onChanged,
	onSelectionChanged,
	onRemoveContext,
	onSubmit,
}: {
	editorRef: React.RefObject<HTMLDivElement | null>;
	composingRef: React.RefObject<boolean>;
	mode: "home" | "chat";
	state: ComposerState;
	disabled: boolean;
	onChanged: (snapshot: ComposerEditorSnapshot) => void;
	onSelectionChanged: (offset: number) => void;
	onRemoveContext: (key: string) => void;
	onSubmit: () => void;
}) {
	const parts = composerEditorParts(state);
	const placeholder =
		mode === "home"
			? "Ask about your CRM or automate a task…"
			: "Send a message";
	const commit = () => {
		const root = editorRef.current;
		if (!root || composingRef.current) return;
		onChanged(readComposerEditor(root, state.draft.length));
	};
	const captureSelection = () => {
		const root = editorRef.current;
		if (!root) return;
		onSelectionChanged(composerEditorOffset(root, state.draft.length));
	};

	return (
		<TokenField
			ref={editorRef}
			role="textbox"
			tabIndex={disabled ? -1 : 0}
			aria-label="Message the agent builder"
			aria-multiline="true"
			aria-disabled={disabled}
			data-empty={state.draft.length === 0 && state.anchors.length === 0}
			data-placeholder={placeholder}
			spellCheck
			onFocus={(event) => {
				if (event.target !== event.currentTarget) return;
				focusEditorAtOffset(event.currentTarget, state.draft.length);
			}}
			onPointerDown={(event) => {
				if (event.target !== event.currentTarget) return;
				event.preventDefault();
				onSelectionChanged(state.draft.length);
				focusEditorAtOffset(event.currentTarget, state.draft.length);
			}}
			onBeforeInput={(event) =>
				ensureComposerEditorSelection(event.currentTarget, state.draft.length)
			}
			onInput={commit}
			onBlur={captureSelection}
			onKeyUp={captureSelection}
			onPointerUp={captureSelection}
			onCompositionStart={() => {
				composingRef.current = true;
			}}
			onCompositionEnd={() => {
				composingRef.current = false;
				commit();
			}}
			onPaste={(event) => {
				event.preventDefault();
				insertEditorText(
					event.currentTarget,
					event.clipboardData.getData("text/plain"),
				);
				commit();
			}}
			onDrop={(event) => event.preventDefault()}
			onKeyDown={(event) => {
				if (event.nativeEvent.isComposing || composingRef.current) return;
				if (event.key === "Enter") {
					event.preventDefault();
					if (event.shiftKey) {
						insertEditorText(event.currentTarget, "\n");
						commit();
					} else {
						onSubmit();
					}
					return;
				}
				if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
					const offset = moveComposerCaretAcrossContext(
						event.currentTarget,
						event.key === "ArrowLeft" ? "previous" : "next",
					);
					if (offset !== null) {
						event.preventDefault();
						onSelectionChanged(offset);
					}
					return;
				}
				if (event.key === "Backspace") {
					const key = previousComposerContextKey(event.currentTarget);
					if (!key) return;
					event.preventDefault();
					onSelectionChanged(
						composerEditorOffset(event.currentTarget, state.draft.length),
					);
					onRemoveContext(key);
				}
			}}
		>
			{parts.map((part) =>
				part.type === "text" ? (
					<ComposerEditorText
						key={part.key}
						start={part.start}
						value={part.value}
						disabled={disabled}
						detectedIntent={state.detectedCommandLabel}
						intentStart={
							state.detectedCommandLabel
								? state.draft.indexOf(state.detectedCommandLabel)
								: -1
						}
					/>
				) : (
					<ComposerContextToken
						key={part.anchor.key}
						anchor={part.anchor}
						state={state}
						disabled={disabled}
						onRemove={onRemoveContext}
					/>
				),
			)}
		</TokenField>
	);
}

function ComposerEditorText({
	start,
	value,
	disabled,
	detectedIntent,
	intentStart,
}: {
	start: number;
	value: string;
	disabled: boolean;
	detectedIntent: string | null;
	intentStart: number;
}) {
	const localIntentStart = intentStart - start;
	const showsIntent =
		detectedIntent !== null &&
		localIntentStart >= 0 &&
		localIntentStart + detectedIntent.length <= value.length;

	return (
		<span
			contentEditable={!disabled}
			suppressContentEditableWarning
			tabIndex={-1}
			role="none"
			data-composer-text
			data-composer-text-start={start}
		>
			{showsIntent ? (
				<>
					{value.slice(0, localIntentStart)}
					<span data-intent-trigger className="relative">
						{detectedIntent}
						<span
							contentEditable={false}
							data-intent-accent
							className="absolute inset-x-0 bottom-0 h-px origin-left animate-in bg-primary duration-200 ease-out zoom-in-0 motion-reduce:animate-none"
						/>
					</span>
					{value.slice(localIntentStart + detectedIntent.length)}
				</>
			) : (
				value || EDITOR_SENTINEL
			)}
		</span>
	);
}

function ComposerContextToken({
	anchor,
	state,
	disabled,
	onRemove,
}: {
	anchor: ComposerAnchor;
	state: ComposerState;
	disabled: boolean;
	onRemove: (key: string) => void;
}) {
	const remove = disabled ? undefined : () => onRemove(anchor.key);
	let content: React.ReactNode = null;
	if (anchor.key === COMMAND_CONTEXT_KEY && state.command) {
		content = (
			<ChatCommandChip
				label={state.command.label}
				icon={Application}
				variant="composer"
				onRemove={remove}
			/>
		);
	} else {
		const resource = state.resources.find(
			(item) => resourceContextKey(item) === anchor.key,
		);
		if (resource) {
			content = (
				<ChatReferenceChip
					resource={resource}
					icon={RESOURCE_ICONS[resource.kind]}
					variant="composer"
					onRemove={remove}
				/>
			);
		} else {
			const attachment = state.attachments.find(
				(item) => attachmentContextKey(item) === anchor.key,
			);
			if (attachment) {
				content = (
					<ChatAttachmentChip
						attachment={attachment}
						variant="composer"
						onRemove={remove}
					/>
				);
			}
		}
	}
	if (!content) return null;

	return (
		<span
			contentEditable={false}
			data-composer-token-key={anchor.key}
			data-composer-token-order={anchor.order}
			className="inline-flex align-middle"
		>
			{content}
		</span>
	);
}

function composerEditorParts(state: ComposerState): ComposerEditorPart[] {
	const activeKeys = new Set<string>();
	if (state.command) activeKeys.add(COMMAND_CONTEXT_KEY);
	for (const resource of state.resources) {
		activeKeys.add(resourceContextKey(resource));
	}
	for (const attachment of state.attachments) {
		activeKeys.add(attachmentContextKey(attachment));
	}
	const anchors = state.anchors
		.filter((anchor) => activeKeys.has(anchor.key))
		.map((anchor) => clampAnchor(anchor, state.draft.length))
		.sort(
			(left, right) => left.offset - right.offset || left.order - right.order,
		);
	const parts: ComposerEditorPart[] = [];
	let cursor = 0;
	let previousKey = "start";
	for (const anchor of anchors) {
		parts.push({
			type: "text",
			key: `text-after:${previousKey}`,
			start: cursor,
			value: state.draft.slice(cursor, anchor.offset),
		});
		parts.push({ type: "context", anchor });
		cursor = anchor.offset;
		previousKey = anchor.key;
	}
	parts.push({
		type: "text",
		key: `text-after:${previousKey}`,
		start: cursor,
		value: state.draft.slice(cursor),
	});
	return parts;
}

function readComposerEditor(
	root: HTMLDivElement,
	fallbackOffset: number,
): ComposerEditorSnapshot {
	const selectionOffset = composerEditorOffset(root, fallbackOffset);
	const anchors: ComposerAnchor[] = [];
	let value = "";
	for (const node of Array.from(root.childNodes)) {
		if (node instanceof HTMLElement && node.dataset.composerTokenKey) {
			anchors.push({
				key: node.dataset.composerTokenKey,
				offset: value.length,
				order: Number(node.dataset.composerTokenOrder ?? anchors.length),
			});
			continue;
		}
		value += composerEditableText(node);
	}
	return { value, anchors, selectionOffset };
}

function composerEditorOffset(
	root: HTMLDivElement,
	fallbackOffset: number,
): number {
	const selection = root.ownerDocument.defaultView?.getSelection();
	const focusNode = selection?.focusNode;
	if (!selection || !focusNode || !root.contains(focusNode)) {
		return Math.max(
			0,
			Math.min(fallbackOffset, composerEditableText(root).length),
		);
	}
	if (focusNode === root) {
		let offset = 0;
		for (const node of Array.from(root.childNodes).slice(
			0,
			selection.focusOffset,
		)) {
			offset += composerEditableText(node).length;
		}
		return offset;
	}

	let offset = 0;
	for (const node of Array.from(root.childNodes)) {
		if (node === focusNode || node.contains?.(focusNode)) {
			return (
				offset + composerOffsetWithin(node, focusNode, selection.focusOffset)
			);
		}
		offset += composerEditableText(node).length;
	}
	return Math.max(0, Math.min(fallbackOffset, offset));
}

function composerOffsetWithin(
	container: Node,
	target: Node,
	targetOffset: number,
): number {
	const range = container.ownerDocument?.createRange();
	if (!range) return 0;
	try {
		range.selectNodeContents(container);
		range.setEnd(target, targetOffset);
		return composerEditableText(range.cloneContents()).length;
	} catch {
		return 0;
	}
}

function composerEditableText(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return (node.textContent ?? "").replaceAll(EDITOR_SENTINEL, "");
	}
	if (node instanceof HTMLElement) {
		if (
			node.dataset.composerTokenKey ||
			node.dataset.intentAccent !== undefined
		) {
			return "";
		}
		if (
			node.dataset.composerText !== undefined &&
			node.childNodes.length === 1 &&
			node.firstChild instanceof HTMLBRElement
		) {
			return "";
		}
		if (node.tagName === "BR") return "\n";
	}
	let value = "";
	for (const child of Array.from(node.childNodes)) {
		value += composerEditableText(child);
	}
	return value;
}

function previousComposerContextKey(root: HTMLDivElement): string | null {
	const selection = root.ownerDocument.defaultView?.getSelection();
	const focusNode = selection?.focusNode;
	if (!selection?.isCollapsed || !focusNode || !root.contains(focusNode)) {
		return null;
	}
	const parent =
		focusNode instanceof HTMLElement ? focusNode : focusNode.parentElement;
	const text = parent?.closest<HTMLElement>("[data-composer-text]");
	if (text && root.contains(text)) {
		if (composerOffsetWithin(text, focusNode, selection.focusOffset) !== 0) {
			return null;
		}
		return text.previousElementSibling instanceof HTMLElement
			? (text.previousElementSibling.dataset.composerTokenKey ?? null)
			: null;
	}
	if (focusNode === root && selection.focusOffset > 0) {
		const previous = root.childNodes.item(selection.focusOffset - 1);
		return previous instanceof HTMLElement
			? (previous.dataset.composerTokenKey ?? null)
			: null;
	}
	return null;
}

function moveComposerCaretAcrossContext(
	root: HTMLDivElement,
	direction: "previous" | "next",
): number | null {
	const selection = root.ownerDocument.defaultView?.getSelection();
	const focusNode = selection?.focusNode;
	if (!selection?.isCollapsed || !focusNode || !root.contains(focusNode)) {
		return null;
	}
	const parent =
		focusNode instanceof HTMLElement ? focusNode : focusNode.parentElement;
	const text = parent?.closest<HTMLElement>("[data-composer-text]");
	if (!text) return null;
	const localOffset = composerOffsetWithin(
		text,
		focusNode,
		selection.focusOffset,
	);
	const textLength = composerEditableText(text).length;
	if (direction === "previous" && localOffset === 0) {
		const token = text.previousElementSibling;
		const previous = token?.previousElementSibling;
		if (
			!(token instanceof HTMLElement) ||
			!token.dataset.composerTokenKey ||
			!(previous instanceof HTMLElement) ||
			previous.dataset.composerText === undefined
		) {
			return null;
		}
		setComposerCaret(previous, composerEditableText(previous).length);
		return Number(text.dataset.composerTextStart ?? 0);
	}
	if (direction === "next" && localOffset === textLength) {
		const token = text.nextElementSibling;
		const next = token?.nextElementSibling;
		if (
			!(token instanceof HTMLElement) ||
			!token.dataset.composerTokenKey ||
			!(next instanceof HTMLElement) ||
			next.dataset.composerText === undefined
		) {
			return null;
		}
		setComposerCaret(next, 0);
		return Number(next.dataset.composerTextStart ?? 0);
	}
	return null;
}

function insertEditorText(root: HTMLDivElement, value: string): void {
	let selection = root.ownerDocument.defaultView?.getSelection();
	if (
		!selection?.rangeCount ||
		!selection.focusNode ||
		!root.contains(selection.focusNode)
	) {
		focusEditorAtOffset(root, composerEditableText(root).length);
		selection = root.ownerDocument.defaultView?.getSelection();
	}
	if (!selection?.rangeCount) return;
	const range = selection.getRangeAt(0);
	range.deleteContents();
	const text = root.ownerDocument.createTextNode(value);
	range.insertNode(text);
	range.setStartAfter(text);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

function ensureComposerEditorSelection(
	root: HTMLDivElement,
	fallbackOffset: number,
): void {
	const selection = root.ownerDocument.defaultView?.getSelection();
	const focusNode = selection?.focusNode;
	const parent =
		focusNode instanceof HTMLElement ? focusNode : focusNode?.parentElement;
	if (parent?.closest("[data-composer-text]")) return;
	focusEditorAtOffset(root, composerEditorOffset(root, fallbackOffset));
}

function focusEditorAtOffset(
	root: HTMLDivElement | null,
	offset: number,
): void {
	if (!root) return;
	const textParts = Array.from(
		root.querySelectorAll<HTMLElement>("[data-composer-text]"),
	);
	let target = textParts.at(-1) ?? null;
	for (const part of textParts) {
		const start = Number(part.dataset.composerTextStart ?? 0);
		const end = start + composerEditableText(part).length;
		if (start <= offset && offset <= end) target = part;
	}
	if (!target) return;
	const start = Number(target.dataset.composerTextStart ?? 0);
	setComposerCaret(target, Math.max(0, offset - start));
}

function focusEditorAfterContext(
	root: HTMLDivElement | null,
	key: string,
): number | null {
	if (!root) return null;
	const token = Array.from(
		root.querySelectorAll<HTMLElement>("[data-composer-token-key]"),
	).find((item) => item.dataset.composerTokenKey === key);
	const text = token?.nextElementSibling;
	if (!(text instanceof HTMLElement) || !text.dataset.composerText) return null;
	setComposerCaret(text, 0);
	return Number(text.dataset.composerTextStart ?? 0);
}

function setComposerCaret(container: HTMLElement, offset: number): void {
	container.focus();
	const textNodes: Text[] = [];
	const collect = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			textNodes.push(node as Text);
			return;
		}
		if (
			node instanceof HTMLElement &&
			(node.contentEditable === "false" ||
				node.dataset.composerTokenKey ||
				node.dataset.intentAccent !== undefined)
		) {
			return;
		}
		for (const child of Array.from(node.childNodes)) collect(child);
	};
	collect(container);
	const range = container.ownerDocument.createRange();
	let remaining = offset;
	for (const text of textNodes) {
		const logicalLength = text.data.replaceAll(EDITOR_SENTINEL, "").length;
		if (remaining <= logicalLength) {
			range.setStart(text, composerDomOffset(text.data, remaining));
			range.collapse(true);
			const selection = container.ownerDocument.defaultView?.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
			return;
		}
		remaining -= logicalLength;
	}
	range.selectNodeContents(container);
	range.collapse(false);
	const selection = container.ownerDocument.defaultView?.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}

function composerDomOffset(value: string, logicalOffset: number): number {
	if (logicalOffset === 0) return 0;
	let logical = 0;
	for (let index = 0; index < value.length; index += 1) {
		if (value[index] !== EDITOR_SENTINEL) logical += 1;
		if (logical === logicalOffset) return index + 1;
	}
	return value.length;
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
	getInsertionOffset,
	onContextAdded,
}: {
	state: ComposerState;
	resources: BuilderResource[];
	resourcesLoading: boolean;
	resourcesReady: boolean;
	connectedGoogle: Array<{ source: string }>;
	disabled: boolean;
	attachmentsReading: boolean;
	dispatch: React.Dispatch<ComposerAction>;
	getInsertionOffset: () => number;
	onContextAdded: (key: string) => void;
}) {
	return (
		<div className="flex items-center gap-0.5">
			<ResourcePicker
				open={state.resourceOpen}
				query={state.resourceQuery}
				resources={resources}
				loading={resourcesLoading}
				ready={resourcesReady}
				connectedGoogle={connectedGoogle}
				disabled={disabled}
				dispatch={dispatch}
				getInsertionOffset={getInsertionOffset}
				onPicked={onContextAdded}
			/>
			<AttachmentPicker
				disabled={
					disabled || attachmentsReading || state.attachments.length >= 5
				}
				remaining={Math.max(0, 5 - state.attachments.length)}
				dispatch={dispatch}
				getInsertionOffset={getInsertionOffset}
				onPicked={onContextAdded}
			/>
			<CommandPicker
				open={state.commandOpen}
				disabled={disabled}
				dispatch={dispatch}
				getInsertionOffset={getInsertionOffset}
				onPicked={onContextAdded}
			/>
		</div>
	);
}

function ResourcePicker({
	open,
	query,
	resources,
	loading,
	ready,
	connectedGoogle,
	disabled,
	dispatch,
	getInsertionOffset,
	onPicked,
}: {
	open: boolean;
	query: string;
	resources: BuilderResource[];
	loading: boolean;
	ready: boolean;
	connectedGoogle: Array<{ source: string }>;
	disabled: boolean;
	dispatch: React.Dispatch<ComposerAction>;
	getInsertionOffset: () => number;
	onPicked: (key: string) => void;
}) {
	const add = (resource: BuilderResource) => {
		dispatch({
			type: "resource.added",
			resource,
			offset: getInsertionOffset(),
		});
		dispatch({ type: "resource.open.changed", open: false });
		onPicked(resourceContextKey(resource));
	};

	return (
		<Popover
			open={disabled ? false : open}
			onOpenChange={(next) =>
				dispatch({ type: "resource.open.changed", open: next })
			}
		>
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
					<InputGroup>
						<InputGroupInput
							value={query}
							onChange={(event) =>
								dispatch({
									type: "resource.query.changed",
									value: event.target.value,
								})
							}
							placeholder="Search CRM"
							aria-label="Search CRM"
							disabled={disabled}
						/>
						<InputGroupAddon>
							<Icon icon={Search} className="size-3.5" />
						</InputGroupAddon>
					</InputGroup>
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
								disabled={disabled}
								onSelect={() =>
									add({
										kind: "integration",
										id: `google:${source.source}`,
										label,
										detail: null,
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
	remaining,
	dispatch,
	getInsertionOffset,
	onPicked,
}: {
	disabled: boolean;
	remaining: number;
	dispatch: React.Dispatch<ComposerAction>;
	getInsertionOffset: () => number;
	onPicked: (key: string) => void;
}) {
	const input = useRef<HTMLInputElement>(null);
	const addFiles = async (files: FileList | null) => {
		if (!files || files.length === 0) return;
		dispatch({ type: "attachments.reading.started" });
		try {
			const attachments = await readFiles(files);
			const accepted = attachments.slice(0, remaining);
			const lastAccepted = accepted.at(-1);
			if (lastAccepted) {
				dispatch({
					type: "attachments.added",
					attachments: accepted,
					offset: getInsertionOffset(),
				});
				onPicked(attachmentContextKey(lastAccepted));
			}
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
	getInsertionOffset,
	onPicked,
}: {
	open: boolean;
	disabled: boolean;
	dispatch: React.Dispatch<ComposerAction>;
	getInsertionOffset: () => number;
	onPicked: (key: string) => void;
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
					onClick={() => {
						dispatch({
							type: "command.selected",
							offset: getInsertionOffset(),
						});
						onPicked(COMMAND_CONTEXT_KEY);
					}}
					className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
					disabled={disabled}
				>
					<Icon icon={Application} className="size-4 text-muted-foreground" />
					<span className="font-medium text-xs">
						/{CREATE_AGENT_COMMAND.label}
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
				<div key={item} className="flex h-8 items-center gap-2">
					<Skeleton className="size-6 shrink-0" />
					<Skeleton className="h-3 w-2/3" />
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

function ResourceButton({
	icon,
	label,
	imageUrl,
	disabled,
	onSelect,
}: {
	icon: CarbonIcon;
	label: string;
	imageUrl?: string | null;
	disabled: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			disabled={disabled}
			className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
		>
			<ChatReferenceIdentity
				resource={{
					kind: "integration",
					id: label,
					label,
					detail: null,
					imageUrl,
				}}
				icon={icon}
				showDetail={false}
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
