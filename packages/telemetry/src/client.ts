import "@crm/env/load";

import { PostHog } from "posthog-node";
import { type Properties, permitted } from "./allowlist";
import { telemetryDisabled } from "./disabled";
import { daysSince, readInstall } from "./install";
import { POSTHOG_HOST, POSTHOG_KEY } from "./project";
import { commitSha } from "./version";

const FLUSH_TIMEOUT_MS = 3_000;

type CaptureMessage = Parameters<PostHog["capture"]>[0];

type Debug = (message: string) => void;

let debug: Debug = () => {};

export function onTelemetryProblem(sink: Debug | null): void {
	debug = sink ?? (() => {});
}

let client: PostHog | null = null;

let built = false;

let failures = 0;

function posthog(): PostHog | null {
	if (built) return client;
	built = true;

	const off = telemetryDisabled();

	try {
		client = new PostHog(POSTHOG_KEY, {
			host: POSTHOG_HOST,
			flushAt: 1,
			flushInterval: 0,
			disabled: off,
			disableGeoip: true,
			enableExceptionAutocapture: false,
			fetchRetryCount: 1,
		});

		if (off) {
			void client.disable().catch(() => {});
			debug("Telemetry is disabled — every capture is a no-op.");
		}

		client.on("error", (error: unknown) => {
			failures += 1;
			debug(
				`PostHog could not send: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		});
	} catch (error) {
		debug(
			`PostHog could not start: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		client = null;
	}

	return client;
}

export function resetTelemetryClient(): void {
	client = null;
	built = false;
	failures = 0;
}

async function payload(
	properties: Properties,
): Promise<Omit<CaptureMessage, "event"> | null> {
	const install = await readInstall();
	if (!install) return null;

	const sha = commitSha();

	const identity: Properties = {
		crm_version: install.version,
		days_since_install: daysSince(install.createdAt),
		is_vercel: Boolean(process.env.VERCEL),
	};

	if (sha) identity.git_commit_sha = sha;

	return {
		distinctId: install.uuid,
		properties: {
			...permitted({ ...identity, ...properties }),
			$ip: null,
			$process_person_profile: false,
		},
		disableGeoip: true,
	};
}

export function capture(event: string, properties: Properties = {}): void {
	void send(event, properties);
}

export async function captureNow(
	event: string,
	properties: Properties = {},
	at?: Date,
	uuid?: string,
): Promise<boolean> {
	return send(event, properties, true, at, uuid);
}

async function send(
	event: string,
	properties: Properties,
	immediate = false,
	at?: Date,
	uuid?: string,
): Promise<boolean> {
	try {
		if (telemetryDisabled()) return false;

		const posted = posthog();
		if (!posted) return false;

		const message = await payload(properties);
		if (!message) return false;

		const full: CaptureMessage = { ...message, event };

		if (at) full.timestamp = at;
		if (uuid) full.uuid = uuid;

		if (immediate) {
			const before = failures;
			posted.capture(full);

			try {
				await posted.flush();
			} catch {
				return false;
			}

			return failures === before;
		}

		posted.capture(full);
		return true;
	} catch (error) {
		debug(
			`Telemetry could not capture ${event}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);

		return false;
	}
}

export async function flushTelemetry(): Promise<void> {
	try {
		await client?.flush();
	} catch (error) {
		debug(
			`Telemetry could not flush: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

export async function shutdownTelemetry(): Promise<void> {
	try {
		await client?._shutdown(FLUSH_TIMEOUT_MS);
	} catch (error) {
		debug(
			`Telemetry could not shut down: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}
