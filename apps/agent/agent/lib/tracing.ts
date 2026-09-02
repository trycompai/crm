import type { EveInstrumentationStepStartedEventInput } from "@inference/tracing/eve";
import { z } from "zod";
import { TRACING } from "./tracing-config";

export type TraceDestination =
	| {
			kind: "inference";
			label: string;
			token: string;
			endpoint: string;
			serviceName: string;
	  }
	| { kind: "off"; label: string };

export type TraceEnv = Readonly<Record<string, string | undefined>>;

export function resolveTraceDestination(env: TraceEnv): TraceDestination {
	const token = trimmed(env[TRACING.inference.keyVar]);

	if (!token) {
		return {
			kind: "off",
			label: `no ${TRACING.inference.keyVar}`,
		};
	}

	const endpoint =
		trimmed(env[TRACING.inference.endpointVar]) ??
		TRACING.inference.defaultEndpoint;

	const serviceName =
		trimmed(env[TRACING.inference.serviceNameVar]) ??
		TRACING.inference.defaultServiceName;

	return { kind: "inference", label: endpoint, token, endpoint, serviceName };
}

export function environmentOf(env: TraceEnv): string {
	return trimmed(env.NODE_ENV) ?? "development";
}

const OFF = new Set(["0", "false", "no", "off"]);

export function recordsTraceContent(env: TraceEnv): boolean {
	const value = trimmed(env[TRACING.content.recordVar])?.toLowerCase();
	if (value === undefined) return TRACING.content.recordByDefault;
	return !OFF.has(value);
}

function trimmed(value: string | undefined): string | null {
	const text = value?.trim();
	return text && text.length > 0 ? text : null;
}

const principal = z.object({
	principalId: z.string().trim().min(1),
	principalType: z.string().trim().min(1),
});

const sessionAuth = z.object({
	initiator: principal.nullish(),
	current: principal.nullish(),
});

type TraceSession = EveInstrumentationStepStartedEventInput["session"];

export function principalOf(session: TraceSession): string | null {
	const parsed = sessionAuth.safeParse(session.auth);
	if (!parsed.success) return null;

	for (const held of [parsed.data.initiator, parsed.data.current]) {
		if (held?.principalType === TRACING.principals.human) {
			return held.principalId;
		}
	}

	return null;
}
