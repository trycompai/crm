"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import CircleDash from "@carbon/icons-react/es/CircleDash";
import Document from "@carbon/icons-react/es/Document";
import LogoGithub from "@carbon/icons-react/es/LogoGithub";
import LogoLinkedin from "@carbon/icons-react/es/LogoLinkedin";
import Send from "@carbon/icons-react/es/Send";
import Warning from "@carbon/icons-react/es/Warning";
import {
	Attachment,
	AttachmentContent,
	AttachmentGroup,
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

	const ask = (message: string) => {
		if (!message.trim() || locked) return;
		opening.current ||= message.trim();
		setDraft("");
		void agent.send({ message: message.trim() });
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<MessageScrollerProvider autoScroll defaultScrollPosition="end">
				<MessageScroller className="flex-1">
					<MessageScrollerViewport>
						<MessageScrollerContent className="gap-3 px-4 py-4 sm:px-5">
							{messages.length === 0 && !busy ? (
								<Idle kind={record.kind} onAsk={ask} />
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
							placeholder={copy.placeholder}
							disabled={locked}
						/>
						<Button
							type="submit"
							size="icon-sm"
							variant="outline"
							disabled={locked}
						>
							{busy ? <Spinner /> : <Icon icon={Send} />}
							<span className="sr-only">Ask</span>
						</Button>
					</form>
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

function useSavedConversation({
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

	const sessionId = session?.sessionId ?? null;
	const token = session?.continuationToken ?? null;
	const streamIndex = session?.streamIndex ?? 0;
	const { contactId, companyId, dealId } = record;

	const isNew = conversation === null || conversation.sessionId !== sessionId;

	const written = useRef<string | null>(null);
	const persist = useEffectEvent(() => {
		save.mutate(
			{
				...(contactId ? { contactId } : {}),
				...(companyId ? { companyId } : {}),
				...(dealId ? { dealId } : {}),
				sessionId: sessionId ?? "",
				continuationToken: token,
				streamIndex,
				messageCount: messages,
				...(isNew ? { title: opening.current ?? undefined } : {}),
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
