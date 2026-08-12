import { db } from "@crm/db";
import { reasonOf, removeAgent } from "./e2e-agents";
import { E2E } from "./e2e-config";

const AGENT_URL = process.env.AGENT_URL ?? E2E.liveRun.agentUrl;
const SECRET = process.env.AGENT_BRIDGE_SECRET?.trim();

if (process.env.E2E_LIVE_MODEL !== "1") {
	console.log(
		"SKIP  live model run — set E2E_LIVE_MODEL=1 to spend credits on this.",
	);
	process.exit(0);
}

async function seedAgent(
	channelId: string,
	channelName: string,
	modelId: string,
) {
	const owner = await db.user.findFirstOrThrow({ select: { id: true } });
	const agent = await db.agentDefinition.create({
		data: {
			name: `${E2E.liveRun.agentPrefix} ${Date.now()}`,
			description: "Seeded by the live run E2E. Safe to delete.",
			status: "LIVE",
			createdById: owner.id,
		},
		select: { id: true },
	});
	const version = await db.agentVersion.create({
		data: {
			agentId: agent.id,
			number: 1,
			status: "DEPLOYED",
			instructions: `Post exactly one short Slack message to #${channelName} that says "E2E live run — ignore this message." Do nothing else.`,
			modelId,
			sandboxPolicy: {},
			createdById: owner.id,
			manifest: {
				description: "live run",
				triggers: [
					{
						type: "MANUAL",
						name: "Run now",
						summary: "Started by a person",
						config: {},
					},
				],
				dataScope: { mode: "WORKSPACE", summary: "Workspace", resources: [] },
				actions: [
					{
						type: "slack.message.post",
						provider: "slack",
						summary: `Post one message to #${channelName}`,
						destination: {
							kind: "channel",
							resolution: "chosen",
							id: channelId,
							label: `#${channelName}`,
						},
					},
				],
			},
		},
		select: { id: true },
	});
	await db.agentDefinition.update({
		where: { id: agent.id },
		data: { currentVersionId: version.id },
	});
	return { agentId: agent.id, versionId: version.id, ownerId: owner.id };
}

async function main() {
	if (!SECRET) {
		console.error("FAIL  AGENT_BRIDGE_SECRET is not set. Cannot dispatch.");
		process.exit(1);
	}

	const channel = await db.slackChannel.findFirst({
		where: { available: true, name: "test" },
		select: { id: true, name: true },
	});
	if (!channel) {
		console.error("FAIL  No available #test channel. Connect Slack first.");
		process.exit(1);
	}

	const settings = await db.appSetting.findUnique({
		where: { id: "app" },
		select: { agentModelId: true },
	});
	if (!settings?.agentModelId) {
		console.error(
			"FAIL  No model is configured. Pick one on the settings page first.",
		);
		process.exit(1);
	}

	const { agentId, versionId, ownerId } = await seedAgent(
		channel.id,
		channel.name,
		settings.agentModelId,
	);
	let ok = false;

	try {
		const run = await db.agentRun.create({
			data: {
				agentId,
				versionId,
				initiatedById: ownerId,
				triggerType: "MANUAL",
				idempotencyKey: crypto.randomUUID(),
				correlationId: crypto.randomUUID(),
				events: { create: { sequence: 0, type: "run.queued", data: {} } },
			},
			select: { id: true },
		});
		console.log(`Queued run ${run.id}. Dispatching…`);

		const dispatch = await fetch(`${AGENT_URL}/internal/crm/agent-dispatch`, {
			method: "POST",
			headers: { authorization: `Bearer ${SECRET}` },
		});
		if (dispatch.status !== 202) {
			console.error(`FAIL  Dispatch returned ${dispatch.status}.`);
		} else {
			const deadline = Date.now() + E2E.liveRun.giveUpMs;
			let final: { status: string; errorCode: string | null } | null = null;

			while (Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, E2E.liveRun.pollMs));
				const current = await db.agentRun.findUniqueOrThrow({
					where: { id: run.id },
					select: { status: true, errorCode: true, errorMessage: true },
				});
				if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(current.status)) {
					final = current;
					break;
				}
				await fetch(`${AGENT_URL}/internal/crm/agent-dispatch`, {
					method: "POST",
					headers: { authorization: `Bearer ${SECRET}` },
				}).catch(() => {});
				console.log(`  still ${current.status}…`);
			}

			const actions = await db.agentAction.findMany({
				where: { runId: run.id },
				select: {
					type: true,
					status: true,
					externalId: true,
					errorMessage: true,
				},
			});
			const events = await db.agentRunEvent.count({ where: { runId: run.id } });

			console.log(`\n  status       ${final?.status ?? "never settled"}`);
			console.log(`  events       ${events}`);
			for (const action of actions) {
				console.log(
					`  action       ${action.type} ${action.status} ${action.externalId ?? action.errorMessage ?? ""}`,
				);
			}

			const posted = actions.some(
				(action) =>
					action.type === "slack.message.post" &&
					action.status === "SUCCEEDED" &&
					Boolean(action.externalId),
			);
			ok = final?.status === "SUCCEEDED" && posted;
		}
	} finally {
		try {
			await removeAgent(agentId);
		} catch (error) {
			ok = false;
			console.error(`  cleanup failed — ${reasonOf(error)}`);
		}
	}

	console.log(ok ? "\nPASS  live model run" : "\nFAIL  live model run");
	process.exit(ok ? 0 : 1);
}

await main();
