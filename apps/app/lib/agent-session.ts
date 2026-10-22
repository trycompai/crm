import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { Client } from "eve/client";

const ABANDONED_AFTER_MS = 90_000;

export type Thread =
	| {
			status: "new";
	  }
	| {
			status: "ready";
			session: ClientSessionState;
			events: readonly MessageStreamEvent[];
	  }
	| {
			status: "working";
			session: ClientSessionState;
			events: readonly MessageStreamEvent[];
	  }
	| {
			status: "ended";
			session: ClientSessionState;
			events: readonly MessageStreamEvent[];
	  }
	| {
			status: "offline";
			events: readonly MessageStreamEvent[];
	  };

export async function loadThread(
	sessionId: string,
	headers: Record<string, string>,
	signal?: AbortSignal,
): Promise<Thread> {
	try {
		const snapshot = await new Client({ headers, host: "" }).sessions
			.attach(sessionId, { streamIndex: 0 })
			.snapshot({ signal });

		return {
			status: classify(snapshot.session, snapshot.events),
			session: snapshot.session,
			events: snapshot.events,
		} as Thread;
	} catch (error) {
		if (signal?.aborted) throw error;

		return { status: "offline", events: [] };
	}
}

export function offlineThread(events: readonly MessageStreamEvent[]): Thread {
	return { status: "offline", events };
}

export function classify(
	_session: ClientSessionState,
	events: readonly MessageStreamEvent[],
	now: number = Date.now(),
): "ready" | "working" | "ended" {
	const last = events.at(-1);
	if (!last) return "ended";
	if (last.type === "session.waiting") return "ready";

	if (last.type === "session.completed" || last.type === "session.failed") {
		return "ended";
	}

	const at = Date.parse(last.meta.at);

	return Number.isNaN(at) || now - at < ABANDONED_AFTER_MS
		? "working"
		: "ended";
}

export function eventsOf(
	thread: Thread | undefined,
): readonly MessageStreamEvent[] {
	return thread && "events" in thread ? thread.events : [];
}

export type ComposerState = {
	locked: boolean;
	ended: boolean;
};

export function composerState(
	thread: Thread | undefined,
	busy: boolean,
): ComposerState {
	const ended = thread?.status === "ended";

	return {
		ended,
		locked: busy || ended || thread?.status === "working",
	};
}
