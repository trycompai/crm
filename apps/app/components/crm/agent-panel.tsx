"use client";

import AttachmentIcon from "@carbon/icons-react/es/Attachment";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import CircleDash from "@carbon/icons-react/es/CircleDash";
import Close from "@carbon/icons-react/es/Close";
import Document from "@carbon/icons-react/es/Document";
import LogoGithub from "@carbon/icons-react/es/LogoGithub";
import LogoLinkedin from "@carbon/icons-react/es/LogoLinkedin";
import Send from "@carbon/icons-react/es/Send";
import Warning from "@carbon/icons-react/es/Warning";
import {
	Attachment,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentGroup,
	AttachmentImage,
	AttachmentMedia,
	AttachmentTitle,
	AttachmentTrigger,
} from "@crm/ui/components/attachment";
import { Bubble, BubbleContent } from "@crm/ui/components/bubble";
import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { type CarbonIcon, Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import Logo from "@crm/ui/components/logo";
import { Markdown } from "@crm/ui/components/markdown";
import { Marker, MarkerContent, MarkerIcon } from "@crm/ui/components/marker";
import {
	Message,
	MessageAvatar,
	MessageContent,
} from "@crm/ui/components/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@crm/ui/components/message-scroller";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEveAgent } from "eve/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentClarificationComposer } from "@/components/agent-clarification-composer";
import {
	type Conversation,
	ConversationPicker,
	useConversations,
} from "@/components/crm/agent-conversations";
import {
	AGENT_ATTACHMENTS,
	type DraftAttachment,
	IMAGE_ACCEPT,
	isImage,
	isUnsupportedImage,
	sizeLimitLabel,
	toDraftAttachment,
	tooLarge,
} from "@/lib/agent-attachments";
import { graphWriteSummary } from "@/lib/agent-graph-result";
import {
	type AgentRecord,
	type AgentRecordFilter,
	recordCopy,
	recordFilter,
	recordHeader,
} from "@/lib/agent-record";
import {
	composerState,
	eventsOf,
	loadThread,
	offlineThread,
	type Thread as ThreadState,
} from "@/lib/agent-session";
import {
	NEW_THREAD,
	pendingQuestion,
	resolveThread,
	type Source,
	type Tone,
	type TranscriptItem,
	toTranscript,
} from "@/lib/agent-transcript";
import { useTRPC } from "@/lib/trpc/client";
import { AgentGraphResult } from "./agent-graph-result";
import { useRecordSheetView } from "./record-sheet/record-stack";

export function AgentPanel({
	record,
	onFinish,
}: {
	record: AgentRecord;
	onFinish?: () => void;
}) {
	const conversations = useConversations(recordFilter(record));
	const { thread, setThread } = useRecordSheetView("overview");

	const history = conversations.data ?? [];

	if (conversations.isPending) return <Loading />;

	return (
		<LoadedAgentPanel
			record={record}
			history={history}
			thread={thread}
			setThread={setThread}
			onFinish={onFinish}
		/>
	);
}

function LoadedAgentPanel({
	record,
	history,
	thread,
	setThread,
	onFinish,
}: {
	record: AgentRecord;
	history: Conversation[];
	thread: string | null;
	setThread: (thread: string) => void;
	onFinish?: () => void;
}) {
	const [landedOn] = useState(() => history[0]?.id ?? NEW_THREAD);
	const { openId, current } = resolveThread({
		conversations: history,
		fromUrl: thread,
		landedOn,
	});

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<ConversationPicker
				conversations={history}
				current={current}
				onSelect={(conversation) => setThread(conversation.id)}
				onNew={() => setThread(NEW_THREAD)}
				busy={false}
			/>

			<ThreadWithHistory
				key={openId ?? NEW_THREAD}
				record={record}
				conversation={current}
				onNewThread={() => setThread(NEW_THREAD)}
				onFinish={onFinish}
			/>
		</div>
	);
}

const WORKING_POLL_MS = 3000;
const SETTLED_TTL_MS = 60_000;

function ThreadWithHistory({
	record,
	conversation,
	onNewThread,
	onFinish,
}: {
	record: AgentRecord;
	conversation: Conversation | null;
	onNewThread: () => void;
	onFinish?: () => void;
}) {
	const trpc = useTRPC();

	const thread = useQuery<ThreadState>({
		queryKey: ["agent-thread", conversation?.sessionId],
		enabled: conversation !== null,
		staleTime: SETTLED_TTL_MS,
		refetchOnWindowFocus: false,
		refetchInterval: (query) =>
			query.state.data?.status === "working" ? WORKING_POLL_MS : false,
		queryFn: ({ signal }) =>
			loadThread(conversation?.sessionId ?? "", recordHeader(record), signal),
	});

	const offline = thread.data?.status === "offline";

	const archive = useQuery({
		...trpc.conversations.events.queryOptions({ id: conversation?.id ?? "" }),
		enabled: conversation !== null && offline,
		staleTime: SETTLED_TTL_MS,
	});

	if (conversation && (thread.isPending || (offline && archive.isPending)))
		return <Loading />;

	return (
		<Thread
			key={thread.data?.status === "working" ? "working" : "settled"}
			record={record}
			conversation={conversation}
			thread={
				offline ? offlineThread((archive.data ?? []) as never) : thread.data
			}
			onNewThread={onNewThread}
			onFinish={onFinish}
		/>
	);
}

function Loading() {
	return (
		<div className="flex flex-1 items-center justify-center">
			<Spinner />
		</div>
	);
}

function Thread({
	record,
	conversation,
	thread,
	onNewThread,
	onFinish,
}: {
	record: AgentRecord;
	conversation: Conversation | null;
	thread: ThreadState | undefined;
	onNewThread: () => void;
	onFinish?: () => void;
}) {
	const copy = recordCopy(record);
	const agent = useEveAgent({
		headers: recordHeader(record),
		onFinish,
		...(thread && "session" in thread
			? { initialSession: thread.session, initialEvents: eventsOf(thread) }
			: { initialEvents: eventsOf(thread) }),
	});
	const [draft, setDraft] = useState("");
	const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
	const [reading, setReading] = useState(0);
	const filePicker = useRef<HTMLInputElement>(null);

	const opening = useRef<string | null>(conversation?.title ?? null);

	useSavedConversation({
		record: recordFilter(record),
		conversation,
		opening,
		session: agent.session ?? null,
		messages: agent.data.messages.length,
	});

	const busy = agent.status === "submitted" || agent.status === "streaming";
	const messages = toTranscript(agent.data.messages);
	const question = pendingQuestion(agent.data.messages);

	const { locked, ended } = composerState(thread, busy);
	const loading = reading > 0;

	const addFiles = (files: File[]) => {
		if (files.some(isUnsupportedImage)) {
			toast.error(AGENT_ATTACHMENTS.copy.unsupportedType);
		}

		const images = files.filter(isImage);
		if (images.length === 0) return;

		const room = AGENT_ATTACHMENTS.image.maxCount - attachments.length;
		if (room <= 0) {
			toast.error(
				`No more than ${AGENT_ATTACHMENTS.image.maxCount} images per message.`,
			);
			return;
		}

		for (const image of images.slice(0, room)) {
			if (tooLarge(image)) {
				toast.error(
					`${image.name || "That image"} is larger than ${sizeLimitLabel()}.`,
				);
				continue;
			}

			setReading((count) => count + 1);
			void toDraftAttachment(image)
				.then((attachment) =>
					setAttachments((current) =>
						current.length < AGENT_ATTACHMENTS.image.maxCount
							? [...current, attachment]
							: current,
					),
				)
				.catch(() => toast.error(AGENT_ATTACHMENTS.copy.readFailed))
				.finally(() => setReading((count) => count - 1));
		}
	};

	const blindToImages = useModelReadsImages(attachments.length > 0) === false;

	const panel = useRef<HTMLDivElement>(null);
	const pasteAnywhere = useEffectEvent((event: ClipboardEvent) => {
		if (locked || question) return;
		if (panel.current === null || panel.current.offsetParent === null) return;

		const target = event.target instanceof HTMLElement ? event.target : null;
		if (target?.closest("input, textarea, [contenteditable=true]")) return;

		const files = Array.from(event.clipboardData?.files ?? []);
		if (!files.some(isImage)) return;

		event.preventDefault();
		addFiles(files);
	});

	useEffect(() => {
		const listener = (event: ClipboardEvent) => pasteAnywhere(event);
		window.addEventListener("paste", listener);
		return () => window.removeEventListener("paste", listener);
	}, []);

	const ask = (message: string) => {
		const text = message.trim();
		if (locked || loading || (!text && attachments.length === 0)) return;
		opening.current ||= text || "Sent an image";
		setDraft("");
		setAttachments([]);

		if (attachments.length === 0) {
			void agent.send({ message: text });
			return;
		}

		void agent.send({
			message: [
				...(text ? [{ type: "text" as const, text }] : []),
				...attachments.map((attachment) => ({
					type: "file" as const,
					data: attachment.dataUrl,
					mediaType: attachment.mediaType,
					...(attachment.filename ? { filename: attachment.filename } : {}),
				})),
			],
		});
	};

	return (
		<div ref={panel} className="flex min-h-0 flex-1 flex-col">
			<MessageScrollerProvider autoScroll defaultScrollPosition="end">
				<MessageScroller className="flex-1">
					<MessageScrollerViewport>
						<MessageScrollerContent className="gap-3 px-4 py-4 sm:px-5">
							{messages.length === 0 && !busy ? (
								<Idle record={record} onAsk={ask} />
							) : null}

							{messages.map((message) => (
								<MessageScrollerItem key={message.id} messageId={message.id}>
									<div className="space-y-3">
										{message.items.map((item) =>
											item.kind === "asked" &&
											item.question.requestId === question?.requestId ? null : (
												<Item key={item.id} item={item} />
											),
										)}
									</div>
								</MessageScrollerItem>
							))}
						</MessageScrollerContent>
					</MessageScrollerViewport>

					<MessageScrollerButton />
				</MessageScroller>
			</MessageScrollerProvider>

			{agent.error ? <Failure message={agent.error.message} /> : null}

			{thread?.status === "working" && !busy ? (
				<p className="border-t px-4 py-2 text-pretty text-muted-foreground text-xs sm:px-5">
					Still working on the last question. Your next one can go in when it
					finishes.
				</p>
			) : null}

			{ended ? (
				<div className="flex flex-col items-start gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-2">
					<p className="text-pretty text-muted-foreground text-xs">
						This conversation has ended.
					</p>
					<Button variant="outline" size="sm" onClick={onNewThread}>
						Start a new conversation
					</Button>
				</div>
			) : null}

			<div className="border-t px-4 py-3 sm:px-5">
				{question ? (
					<AgentClarificationComposer
						key={question.requestId}
						question={question}
						pending={busy}
						onSubmit={(response) => agent.send({ inputResponses: [response] })}
					/>
				) : (
					<>
						{attachments.length > 0 && blindToImages ? (
							<p className="pb-2 text-pretty text-muted-foreground text-xs">
								This model cannot read images. Pick one marked with an image
								icon in Settings, or the agent answers on your words alone.
							</p>
						) : null}

						{attachments.length > 0 ? (
							<AttachmentGroup className="pb-2">
								{attachments.map((attachment) => (
									<Attachment key={attachment.id} size="sm" state="done">
										<AttachmentMedia variant="image">
											<AttachmentImage
												src={attachment.dataUrl}
												alt={attachment.filename ?? "Pasted image"}
											/>
										</AttachmentMedia>
										<AttachmentContent>
											<AttachmentTitle>
												{attachment.filename ?? "Pasted image"}
											</AttachmentTitle>
										</AttachmentContent>
										<AttachmentActions>
											<AttachmentAction
												aria-label="Remove the image"
												onClick={() =>
													setAttachments((current) =>
														current.filter(
															(entry) => entry.id !== attachment.id,
														),
													)
												}
											>
												<Icon icon={Close} />
											</AttachmentAction>
										</AttachmentActions>
									</Attachment>
								))}
							</AttachmentGroup>
						) : null}

						<form
							className="flex min-w-0 items-center gap-2"
							onSubmit={(event) => {
								event.preventDefault();
								ask(draft);
							}}
						>
							<Input
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								onPaste={(event) => {
									const files = Array.from(event.clipboardData.files);
									if (files.some(isImage)) {
										event.preventDefault();
										addFiles(files);
									}
								}}
								placeholder={copy.placeholder}
								disabled={locked}
							/>
							<input
								ref={filePicker}
								type="file"
								accept={IMAGE_ACCEPT}
								multiple
								className="sr-only"
								onChange={(event) => {
									addFiles(Array.from(event.target.files ?? []));
									event.target.value = "";
								}}
							/>
							<Button
								type="button"
								size="icon-sm"
								variant="ghost"
								disabled={locked}
								onClick={() => filePicker.current?.click()}
							>
								<Icon icon={AttachmentIcon} />
								<span className="sr-only">Attach an image</span>
							</Button>
							<Button
								type="submit"
								size="icon-sm"
								variant="outline"
								disabled={locked || loading}
							>
								{busy || loading ? <Spinner /> : <Icon icon={Send} />}
								<span className="sr-only">Ask</span>
							</Button>
						</form>
					</>
				)}
			</div>
		</div>
	);
}

function Idle({
	record,
	onAsk,
}: {
	record: AgentRecord;
	onAsk: (question: string) => void;
}) {
	const copy = recordCopy(record);

	return (
		<Empty width="wide">
			<EmptyHeader>
				<EmptyMedia>
					<span className="flex size-8 items-center justify-center bg-foreground text-background">
						<Logo className="size-4" />
					</span>
				</EmptyMedia>
				<EmptyTitle>{copy.title}</EmptyTitle>
				<EmptyDescription>{copy.blurb}</EmptyDescription>
			</EmptyHeader>

			<EmptyContent layout="row">
				{copy.suggestions.map((suggestion) => (
					<Button
						key={suggestion}
						variant="outline"
						size="sm"
						onClick={() => onAsk(suggestion)}
					>
						{suggestion}
					</Button>
				))}
			</EmptyContent>
		</Empty>
	);
}

function Failure({ message }: { message: string }) {
	const hint = message.includes("not reachable")
		? "Start it with `bun run dev`, or check AGENT_URL."
		: message.includes("not configured")
			? "Set AGENT_BRIDGE_SECRET for both the app and the agent."
			: null;

	return (
		<div className="border-t px-4 py-3 text-xs sm:px-5">
			<p className="wrap-break-word text-destructive">{message}</p>
			{hint ? (
				<p className="wrap-break-word text-muted-foreground text-xs">{hint}</p>
			) : null}
		</div>
	);
}

const TONE_ICONS: Record<Tone, CarbonIcon> = {
	neutral: CircleDash,
	success: Checkmark,
	warning: Warning,
};

const SOURCE_ICONS: Record<Source["network"], CarbonIcon> = {
	linkedin: LogoLinkedin,
	github: LogoGithub,
	web: Document,
};

function Item({ item }: { item: TranscriptItem }) {
	if (item.kind === "said") {
		return item.mine ? (
			<Message align="end" className="min-w-0">
				<MessageContent>
					<Bubble variant="secondary" align="end">
						<BubbleContent className="text-pretty">{item.text}</BubbleContent>
					</Bubble>
				</MessageContent>
			</Message>
		) : (
			<Message className="min-w-0">
				<AgentAvatar />
				<MessageContent>
					<Bubble variant="ghost">
						<BubbleContent>
							<Markdown className="wrap-break-word">{item.text}</Markdown>
						</BubbleContent>
					</Bubble>
				</MessageContent>
			</Message>
		);
	}

	if (item.kind === "asked") {
		return (
			<div className="w-full max-w-sm border-ring/50 border-l-2 bg-muted/40 px-3 py-2.5">
				<p className="font-medium text-xs">Follow-up</p>
				<Markdown className="mt-1.5 wrap-break-word text-sm leading-5">
					{item.question.prompt}
				</Markdown>
			</div>
		);
	}

	if (item.kind === "reasoned") return null;

	if (item.kind === "attached") {
		const label = item.filename ?? "Pasted image";
		return (
			<Message align={item.mine ? "end" : "start"} className="min-w-0">
				<MessageContent>
					<Attachment size="sm" state="done">
						{item.url && item.mediaType.startsWith("image/") ? (
							<AttachmentMedia variant="image">
								<AttachmentImage src={item.url} alt={label} />
							</AttachmentMedia>
						) : (
							<AttachmentMedia variant="icon">
								<Icon icon={AttachmentIcon} />
							</AttachmentMedia>
						)}
						<AttachmentContent>
							<AttachmentTitle>{label}</AttachmentTitle>
						</AttachmentContent>
					</Attachment>
				</MessageContent>
			</Message>
		);
	}

	const graph =
		item.tool === "write_campaign_graph" && !item.pending
			? graphWriteSummary(item.input, item.output)
			: null;

	if (graph) return <AgentGraphResult summary={graph} />;

	return (
		<div className="min-w-0 space-y-1.5">
			<Marker>
				<MarkerIcon>
					{item.pending ? <Spinner /> : <Icon icon={TONE_ICONS[item.tone]} />}
				</MarkerIcon>
				<MarkerContent>{item.label}</MarkerContent>
			</Marker>

			{item.sources.length > 0 ? <Sources sources={item.sources} /> : null}
		</div>
	);
}

function Sources({ sources }: { sources: Source[] }) {
	return (
		<AttachmentGroup>
			{sources.map((source) => (
				<Attachment key={source.url} size="xs" state="done">
					<AttachmentMedia variant="icon">
						<Icon icon={SOURCE_ICONS[source.network]} />
					</AttachmentMedia>
					<AttachmentContent>
						<AttachmentTitle>{source.title}</AttachmentTitle>
					</AttachmentContent>

					<AttachmentTrigger asChild>
						<a href={source.url} target="_blank" rel="noreferrer noopener">
							<span className="sr-only">Open {source.title}</span>
						</a>
					</AttachmentTrigger>
				</Attachment>
			))}
		</AttachmentGroup>
	);
}

function AgentAvatar() {
	return (
		<MessageAvatar>
			<span className="flex size-7 items-center justify-center bg-foreground text-background">
				<Logo className="size-3.5" />
			</span>
		</MessageAvatar>
	);
}

function useModelReadsImages(enabled: boolean): boolean | null {
	const trpc = useTRPC();
	const settings = useQuery({
		...trpc.settings.agentModel.queryOptions(),
		enabled,
	});

	return settings.data?.effective?.vision ?? null;
}

function useSavedConversation({
	record,
	conversation,
	opening,
	session,
	messages,
}: {
	record: AgentRecordFilter;
	conversation: Conversation | null;
	opening: React.RefObject<string | null>;
	session: {
		sessionId?: string;
		continuationToken?: string;
		streamIndex: number;
	} | null;
	messages: number;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const save = useMutation(trpc.conversations.save.mutationOptions({}));

	const sessionId = session?.sessionId ?? null;
	const token = session?.continuationToken ?? null;
	const streamIndex = session?.streamIndex ?? 0;
	const {
		contactId,
		companyId,
		dealId,
		campaignId,
		campaignNodeId,
		segmentId,
		templateId,
		shellId,
	} = record;

	const isNew = conversation === null || conversation.sessionId !== sessionId;

	const written = useRef<string | null>(null);
	const persist = useEffectEvent(() => {
		save.mutate(
			{
				contactId,
				companyId,
				dealId,
				campaignId,
				campaignNodeId,
				segmentId,
				templateId,
				shellId,
				sessionId: sessionId ?? "",
				continuationToken: token,
				streamIndex,
				messageCount: messages,
				title: isNew ? (opening.current ?? undefined) : undefined,
			},
			{
				onSuccess: () => {
					if (!isNew) return;
					void queryClient.invalidateQueries({
						queryKey: trpc.conversations.list.pathKey(),
					});
				},
			},
		);
	});

	useEffect(() => {
		if (!sessionId) return;

		const cursor = `${sessionId}:${token ?? ""}:${messages}`;
		if (written.current === cursor) return;
		written.current = cursor;
		persist();
	}, [sessionId, token, messages]);
}
