"use client";

import {
	Attachment,
	AttachmentContent,
	AttachmentGroup,
	AttachmentMedia,
	AttachmentTitle,
	AttachmentTrigger,
} from "@crm/ui/components/attachment";
import GitHubLogo from "@crm/ui/components/brand-logos/github";
import LinkedInLogo from "@crm/ui/components/brand-logos/linkedin";
import { Bubble, BubbleContent } from "@crm/ui/components/bubble";
import { Button } from "@crm/ui/components/button";
import { ChatComposer } from "@crm/ui/components/chat-composer";
import {
	ChatEmptyState,
	ChatSuggestions,
} from "@crm/ui/components/chat-thread";
import { Icon, type IconComponent } from "@crm/ui/components/icon";
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
import { SkeletonField, SkeletonLine } from "@crm/ui/components/skeleton-lines";
import { Spinner } from "@crm/ui/components/spinner";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { SKELETON, skeletonRows } from "@crm/ui/lib/skeleton-config";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEveAgent } from "eve/react";
import {
	CheckIcon,
	CircleAlertIcon,
	CircleDashedIcon,
	FileTextIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { AgentClarificationComposer } from "@/components/agent-clarification-composer";
import {
	type Conversation,
	ConversationPicker,
	useConversations,
} from "@/components/crm/agent-conversations";
import {
	type AgentRecord,
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
import { claimCursor, conversationCursor } from "@/lib/conversation-cursor";
import { useTRPC } from "@/lib/trpc/client";
import { useRecordSheetView } from "./record-sheet/record-stack";

export function AgentPanel({ record }: { record: AgentRecord }) {
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
		/>
	);
}

function LoadedAgentPanel({
	record,
	history,
	thread,
	setThread,
}: {
	record: AgentRecord;
	history: Conversation[];
	thread: string | null;
	setThread: (thread: string) => void;
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
}: {
	record: AgentRecord;
	conversation: Conversation | null;
	onNewThread: () => void;
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
		/>
	);
}

function Loading() {
	return (
		<div aria-busy className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-1 flex-col gap-3 py-4">
				{skeletonRows(SKELETON.rows.messages).map((row) => (
					<div key={row} className="flex flex-col gap-2">
						<SkeletonLine width="two-thirds" />
						<SkeletonLine width="40" />
					</div>
				))}
			</div>
			<div className="border-t py-3">
				<SkeletonField />
			</div>
		</div>
	);
}

function Thread({
	record,
	conversation,
	thread,
	onNewThread,
}: {
	record: AgentRecord;
	conversation: Conversation | null;
	thread: ThreadState | undefined;
	onNewThread: () => void;
}) {
	const copy = recordCopy(record.kind);
	const agent = useEveAgent({
		headers: recordHeader(record),
		...(thread && "session" in thread
			? { initialSession: thread.session, initialEvents: eventsOf(thread) }
			: { initialEvents: eventsOf(thread) }),
	});
	const [draft, setDraft] = useState("");

	const opening = useRef<string | null>(conversation?.title ?? null);

	const busy = agent.status === "submitted" || agent.status === "streaming";
	const messages = toTranscript(agent.data.messages);
	const question = pendingQuestion(agent.data.messages);

	const { locked, ended } = composerState(thread, busy);

	const ask = (message: string) => {
		if (!message.trim() || locked) return;
		opening.current ||= message.trim();
		setDraft("");
		void agent.send(message.trim());
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<SavedConversation
				record={recordFilter(record)}
				conversation={conversation}
				opening={opening}
				session={agent.session ?? null}
				messages={agent.data.messages.length}
			/>

			{messages.length === 0 && !busy ? (
				<Idle kind={record.kind} onAsk={ask} />
			) : (
				<MessageScrollerProvider autoScroll defaultScrollPosition="end">
					<MessageScroller className="flex-1">
						<MessageScrollerViewport>
							<MessageScrollerContent className="gap-3 py-4">
								{messages.map((message) => (
									<MessageScrollerItem key={message.id} messageId={message.id}>
										<div className="space-y-3">
											{message.items.map((item) =>
												item.kind === "asked" &&
												item.question.requestId ===
													question?.requestId ? null : (
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
			)}

			{agent.error ? <Failure message={agent.error.message} /> : null}

			{thread?.status === "working" && !busy ? (
				<p className="border-t py-2 text-pretty text-muted-foreground text-xs">
					Still working on the last question. Your next one can go in when it
					finishes.
				</p>
			) : null}

			{ended ? (
				<div className="flex flex-col items-start gap-3 border-t py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2">
					<p className="text-pretty text-muted-foreground text-xs">
						This conversation has ended.
					</p>
					<Button variant="outline" size="sm" onClick={onNewThread}>
						Start a new conversation
					</Button>
				</div>
			) : null}

			<div className="border-t py-3">
				{question ? (
					<AgentClarificationComposer
						key={question.requestId}
						question={question}
						pending={busy}
						onSubmit={(response) => agent.respond([response])}
					/>
				) : (
					<ChatComposer
						busy={busy}
						disabled={locked}
						onSubmit={ask}
						onValueChange={setDraft}
						placeholder={copy.placeholder}
						sendLabel="Ask"
						size="panel"
						value={draft}
					/>
				)}
			</div>
		</div>
	);
}

function Idle({
	kind,
	onAsk,
}: {
	kind: AgentRecord["kind"];
	onAsk: (question: string) => void;
}) {
	const copy = recordCopy(kind);

	return (
		<div className="flex min-h-0 flex-1 flex-col justify-center gap-5 overflow-y-auto py-4">
			<ChatEmptyState
				size="panel"
				title={copy.title}
				description={copy.blurb}
			/>
			<ChatSuggestions suggestions={copy.suggestions} onSelect={onAsk} />
		</div>
	);
}

function Failure({ message }: { message: string }) {
	const hint = message.includes("not reachable")
		? "Start it with `bun run dev`, or check AGENT_URL."
		: message.includes("not configured")
			? "Set AGENT_BRIDGE_SECRET for both the app and the agent."
			: null;

	return (
		<div className="border-t py-3 text-xs">
			<p className="wrap-break-word text-destructive">{message}</p>
			{hint ? (
				<p className="wrap-break-word text-muted-foreground text-xs">{hint}</p>
			) : null}
		</div>
	);
}

const TONE_ICONS = {
	neutral: CircleDashedIcon,
	success: CheckIcon,
	warning: CircleAlertIcon,
} satisfies Record<Tone, IconComponent>;

const SOURCE_ICONS = {
	linkedin: LinkedInLogo,
	github: GitHubLogo,
	web: FileTextIcon,
} satisfies Record<Source["network"], IconComponent>;

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

function SavedConversation({
	record,
	conversation,
	opening,
	session,
	messages,
}: {
	record: { contactId?: string; companyId?: string; dealId?: string };
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
	const written = useRef<string | null>(null);

	const sessionId = session?.sessionId ?? null;
	const token = session?.continuationToken ?? null;
	const streamIndex = session?.streamIndex ?? 0;
	const cursor = conversationCursor({ sessionId, token, messages });
	if (!cursor) return null;

	const { contactId, companyId, dealId } = record;
	const isNew = conversation === null || conversation.sessionId !== sessionId;

	const persist = () => {
		if (!claimCursor(written, cursor)) return;
		save.mutate(
			{
				contactId: contactId || undefined,
				companyId: companyId || undefined,
				dealId: dealId || undefined,
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
	};

	return <SaveCursor key={cursor} onMount={persist} />;
}

function SaveCursor({ onMount }: { onMount: () => void }) {
	useMountEffect(onMount);
	return null;
}
