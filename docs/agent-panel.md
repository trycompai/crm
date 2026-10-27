# The Agent panel — read when touching the record sheet's Agent tab


`lib/agent-record.ts` maps a record kind to everything downstream: the header sent, the
claim minted, the field a conversation is filed under, the empty-thread questions.
`AgentConversation` holds only the handle (session id + cursor); the transcript is in
`AgentEvent` from the audit hook.

- **Load with `session.snapshot()`, never by hand** — one call returns the event
  prefix, the cursor, and a continuation token *iff* eve will accept another turn.
  Hand-rolling the stream produced every panel bug this thing has had.
- **The token is the authority on whether a message can be sent**, not our reading of
  the events.
- **`streamIndex: 0` on resume** — the saved index is where the last *reader* stopped.
- **The snapshot is cached for a minute, not refetched on every mount.** A settled
  thread cannot change under us — `ready` is waiting on the rep, `ended` is over — and
  the snapshot is the whole session from index 0, tens of megabytes on a real thread.
  A live thread stays live through `refetchInterval`, which ignores `staleTime`.
- **`loadThread` rethrows an abort.** Swallowing it caches a false `offline` for the
  life of the `staleTime`; only a genuinely unreachable agent may return one.
- **The archive is fetched only when the snapshot fails.** It is the offline fallback
  and nothing else, so loading it up front bought a serial round trip on every open.
  Nothing renders until it lands — `useEveAgent` reads `initialEvents` once, at mount.
- **It ages with the snapshot, and is never `staleTime: Infinity`.** A session's
  archive is not immutable: the agent appends to it every turn. Held forever, an
  agent that goes down, comes back, and goes down again renders the first outage's
  transcript and silently drops what happened in between. Both reads mirror the same
  session, so both expire at `SETTLED_TTL_MS`.
- **Never key the transcript on the archive.** A refetch that lands while it is
  mounted is ignored on purpose; remounting to pick it up would abort a live answer,
  which is the same failure `keepMounted` exists to prevent. Correcting a stale
  fallback is the next mount's job.
- **The audit hook does not archive `reasoning.appended`.** Every delta carries
  `reasoningSoFar`, the whole reasoning to that point, so the archive grew as the
  square of the tokens — one insert per token, 90% of `AgentEvent`, for events the
  transcript never renders. `reasoning.completed` still lands. eve's durable stream
  keeps its own copy either way; this is only what we file.
- **Quiet for 90 seconds is over, not working** — restarted agents leave sessions with
  no closing boundary, which would lock the thread forever.
- **An unreachable agent is `offline`, not `working`** — fall back to the `AgentEvent`
  archive and keep the composer usable.
- **An ended thread gets a Start-a-new-conversation button, not a locked box**;
  `composerState()` keeps ended and working apart.
- **Nothing mounts until the list has loaded**, or a new session starts and remounts.
- **The landed thread is captured once** (`resolveThread`), or the first save swaps the
  open conversation out from under a live answer. It lives in `?thread=`.
- **Set `keepMounted` on the Agent tab descriptor.**
  `packages/ui/src/components/record-sheet.tsx` keeps opened tabs mounted.
  Radix otherwise removes inactive tabs and aborts the stream.
- **`autoScroll` and nothing else**; `scrollAnchor` stops it following the bottom.
- **One `MessageScrollerItem` per message, not per part**; ids prefer `toolCallId`.
- **Scoped to the rep** — a session id in a body decides which row, never whose.

This lives in the API and is not a breach of rule one: listing history decides nothing.

