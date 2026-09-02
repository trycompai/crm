import { db } from "@crm/db";
import type { SendFn } from "eve/channels";
import { APP_AUTH } from "./app-auth";
import { runToken } from "./custom-agent-dispatch";

const LIVE_STATUSES = ["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"] as const;

export type ResumeOutcome =
	| { kind: "resumed"; runId: string; sessionId: string }
	| { kind: "ignored"; runId: string; reason: string };

export type ResumeInput = {
	runId: string;
	message: string;
	source: string;
	attributes?: Readonly<Record<string, string>>;
};

export async function resumeAgentRun(
	input: ResumeInput,
	send: SendFn,
): Promise<ResumeOutcome> {
	const { runId, message, source } = input;

	const run = await db.agentRun.findUnique({
		where: { id: runId },
		select: {
			id: true,
			status: true,
			sessionId: true,
			agentId: true,
			versionId: true,
			agent: { select: { status: true, name: true } },
		},
	});

	if (!run) return { kind: "ignored", runId, reason: "no such run" };

	if (!(LIVE_STATUSES as readonly string[]).includes(run.status)) {
		return {
			kind: "ignored",
			runId,
			reason: `the run is ${run.status.toLowerCase()}`,
		};
	}

	if (run.agent.status !== "LIVE") {
		return {
			kind: "ignored",
			runId,
			reason: `the agent is ${run.agent.status.toLowerCase()}`,
		};
	}

	if (!run.sessionId) {
		return {
			kind: "ignored",
			runId,
			reason: "the run has not started a session yet",
		};
	}

	try {
		const session = await send(message, {
			auth: {
				authenticator: APP_AUTH.authenticator,
				principalType: APP_AUTH.principalType,
				principalId: APP_AUTH.principalId,
				attributes: {
					purpose: "team-agent",
					runId: run.id,
					agentId: run.agentId,
					versionId: run.versionId,
					resumeSource: source,
					...input.attributes,
				},
			},
			continuationToken: runToken(run.id),
			title: `${run.agent.name} run`,
			mode: "task",
		});

		return { kind: "resumed", runId, sessionId: session.id };
	} catch (error) {
		return {
			kind: "ignored",
			runId,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function runOnSlackChannel(
	channelId: string,
): Promise<string | null> {
	const trimmed = channelId.trim();
	if (!trimmed) return null;

	const run = await db.agentRun.findFirst({
		where: {
			slackChannelId: trimmed,
			status: { in: [...LIVE_STATUSES] },
		},
		orderBy: { createdAt: "desc" },
		select: { id: true },
	});

	return run?.id ?? null;
}

export async function channelOfRun(runId: string): Promise<string | null> {
	const run = await db.agentRun.findUnique({
		where: { id: runId },
		select: { slackChannelId: true },
	});

	return run?.slackChannelId ?? null;
}

export async function claimSlackChannel(
	runId: string,
	channelId: string,
): Promise<string | null> {
	const trimmed = channelId.trim();
	if (!trimmed) return null;

	await db.agentRun.updateMany({
		where: { id: runId, slackChannelId: null },
		data: { slackChannelId: trimmed },
	});

	return channelOfRun(runId);
}

export async function runWatchesSlackChannel(
	runId: string,
	channelId: string | null,
): Promise<boolean> {
	if (!channelId) return false;

	return (await runOnSlackChannel(channelId)) === runId;
}
