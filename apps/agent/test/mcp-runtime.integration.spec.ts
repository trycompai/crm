import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import type { ApprovalContext } from "eve/tools";
import {
	authorizeMcpTool,
	capMcpArchivedResult,
	mcpModelOutput,
} from "../agent/lib/mcp-runtime";

const suffix = crypto.randomUUID();
const platformSlug = `linear-${suffix}`;
const userId = `mcp-runtime-user-${suffix}`;
const readFingerprint = "a".repeat(64);
const changeFingerprint = "b".repeat(64);
const riskyFingerprint = "c".repeat(64);
let agentId = "";
let versionId = "";
let runId = "";
let registrationId = "";
let connectionId = "";
let createdWorkspace = false;

function context(
	toolName: string,
	callId: string,
	purpose = "team-agent",
	permissionMode?: "manual" | "auto" | "bypass",
) {
	return {
		approvedTools: new Set<string>(),
		callId,
		toolName: `${platformSlug}__${toolName}`,
		session: {
			id: `session-${suffix}`,
			auth: {
				current: { attributes: { purpose, runId, permissionMode } },
				initiator: null,
			},
			turn: {},
		},
		getSandbox: async () => {
			throw new Error("The test does not use a sandbox.");
		},
		getSkill: () => {
			throw new Error("The test does not use a skill.");
		},
	} as unknown as ApprovalContext;
}

beforeAll(async () => {
	const workspace = await db.organization.findUnique({
		where: { id: WORKSPACE_ID },
		select: { id: true },
	});
	if (!workspace) {
		await db.organization.create({
			data: {
				id: WORKSPACE_ID,
				name: "Test Workspace",
				slug: "workspace",
				createdAt: new Date(),
			},
		});
		createdWorkspace = true;
	}
	await db.user.create({
		data: {
			id: userId,
			name: "MCP Runtime Test",
			email: `${userId}@example.test`,
		},
	});
	const agent = await db.agentDefinition.create({
		data: { name: "MCP runtime", status: "LIVE", createdById: userId },
		select: { id: true },
	});
	agentId = agent.id;
	const version = await db.agentVersion.create({
		data: {
			agentId,
			number: 1,
			status: "DEPLOYED",
			instructions: "Use approved Linear tools.",
			manifest: {
				triggers: [
					{
						type: "MANUAL",
						name: "Manual",
						summary: "Run manually",
						config: {},
					},
				],
				dataScope: {
					mode: "WORKSPACE",
					summary: "Use the workspace",
					resources: [],
				},
				actions: [
					{
						type: "run.summary",
						provider: "crm",
						summary: "Summarize the run",
					},
				],
				mcp: [
					{
						platformSlug,
						summary: "Use Linear",
						tools: [
							{
								name: "list_issues",
								fingerprint: readFingerprint,
								callKind: "read",
								summary: "List issues",
							},
							{
								name: "create_issue",
								fingerprint: changeFingerprint,
								callKind: "change",
								summary: "Create an issue",
							},
							{
								name: "delete_issue",
								fingerprint: riskyFingerprint,
								callKind: "risky",
								summary: "Delete an issue",
							},
						],
					},
				],
			},
			modelId: "test/model",
			sandboxPolicy: {},
			createdById: userId,
			approvedAt: new Date(),
			deployedAt: new Date(),
		},
		select: { id: true },
	});
	versionId = version.id;
	await db.agentDefinition.update({
		where: { id: agentId },
		data: { currentVersionId: versionId },
	});
	const run = await db.agentRun.create({
		data: {
			agentId,
			versionId,
			triggerType: "MANUAL",
			status: "RUNNING",
			idempotencyKey: `mcp-runtime-${suffix}`,
			correlationId: `mcp-runtime-${suffix}`,
		},
		select: { id: true },
	});
	runId = run.id;
	const registration = await db.mcpClientRegistration.create({
		data: {
			platformSlug,
			metadataFingerprint: suffix,
			issuer: "https://mcp.linear.app",
			clientId: `client-${suffix}`,
		},
		select: { id: true },
	});
	registrationId = registration.id;
	const connection = await db.mcpConnection.create({
		data: {
			organizationId: WORKSPACE_ID,
			platformSlug,
			status: "CONNECTED",
			accessMode: "READ_WRITE",
			grantedScopes: ["read", "write"],
			registrationId,
			connectedById: userId,
			toolSnapshots: {
				create: [
					{
						name: "list_issues",
						description: "List issues",
						inputSchema: {},
						fingerprint: readFingerprint,
						callKind: "read",
						reviewState: "REVIEWED",
					},
					{
						name: "create_issue",
						description: "Create an issue",
						inputSchema: {},
						fingerprint: changeFingerprint,
						callKind: "change",
						reviewState: "REVIEWED",
					},
					{
						name: "delete_issue",
						description: "Delete an issue",
						inputSchema: {},
						fingerprint: riskyFingerprint,
						callKind: "risky",
						reviewState: "REVIEWED",
					},
				],
			},
		},
		select: { id: true },
	});
	connectionId = connection.id;
});

afterAll(async () => {
	await db.mcpConnection.deleteMany({ where: { platformSlug } });
	await db.mcpClientRegistration.deleteMany({ where: { id: registrationId } });
	await db.agentAction.deleteMany({ where: { runId } });
	await db.agentRun.deleteMany({ where: { id: runId } });
	await db.agentDefinition.update({
		where: { id: agentId },
		data: { currentVersionId: null },
	});
	await db.agentVersion.deleteMany({ where: { id: versionId } });
	await db.agentDefinition.deleteMany({ where: { id: agentId } });
	await db.user.deleteMany({ where: { id: userId } });
	if (createdWorkspace) {
		await db.organization.deleteMany({ where: { id: WORKSPACE_ID } });
	}
});

describe("MCP runtime authorization", () => {
	it("caps oversized MCP results before event storage", () => {
		const output = "x".repeat(40_000);
		const result = capMcpArchivedResult("action.result", {
			status: "completed",
			result: {
				kind: "tool-result",
				callId: "large-result",
				toolName: `${platformSlug}__list_issues`,
				output,
			},
		});

		expect(result.result).toMatchObject({
			output: { truncated: true },
		});
		expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(32_768);
	});

	it("caps oversized MCP results before model context", () => {
		const result = mcpModelOutput({ content: "x".repeat(20_000) });

		expect(result).toMatchObject({
			type: "json",
			value: { truncated: true },
		});
		expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(16_384);
	});

	it("denies MCP tools outside deployed agent sessions", async () => {
		const result = await authorizeMcpTool(
			platformSlug,
			context("list_issues", "outside-session", "research"),
		);

		expect(result).toEqual({
			type: "denied",
			reason: "Only deployed agents can use MCP tools.",
		});
	});

	it("approves an unchanged reviewed read tool", async () => {
		expect(
			await authorizeMcpTool(
				platformSlug,
				context("list_issues", "approved-read"),
			),
		).toBe("approved");
	});

	it("keeps read tools automatic in manual mode", async () => {
		expect(
			await authorizeMcpTool(
				platformSlug,
				context("list_issues", "manual-read", "team-agent", "manual"),
			),
		).toBe("approved");
	});

	it("asks before a change in manual mode", async () => {
		expect(
			await authorizeMcpTool(
				platformSlug,
				context("create_issue", "manual-change", "team-agent", "manual"),
			),
		).toBe("user-approval");
		expect(
			await db.agentAction.count({
				where: { idempotencyKey: `${runId}:manual-change` },
			}),
		).toBe(0);
	});

	it("runs a normal change in auto mode", async () => {
		expect(
			await authorizeMcpTool(
				platformSlug,
				context("create_issue", "auto-change", "team-agent", "auto"),
			),
		).toBe("approved");
		expect(
			await db.agentAction.count({
				where: { idempotencyKey: `${runId}:auto-change` },
			}),
		).toBe(1);
	});

	it("asks before a risky change in auto mode", async () => {
		expect(
			await authorizeMcpTool(
				platformSlug,
				context("delete_issue", "auto-risky", "team-agent", "auto"),
			),
		).toBe("user-approval");
	});

	it("runs a risky change in bypass mode", async () => {
		expect(
			await authorizeMcpTool(
				platformSlug,
				context("delete_issue", "bypass-risky", "team-agent", "bypass"),
			),
		).toBe("approved");
	});

	it("denies an ungranted tool", async () => {
		const result = await authorizeMcpTool(
			platformSlug,
			context("unknown_issue", "ungranted"),
		);

		expect(result).toEqual({
			type: "denied",
			reason: "This agent lacks that MCP tool grant.",
		});
	});

	it("denies a tool after its reviewed fingerprint changes", async () => {
		await db.mcpToolSnapshot.updateMany({
			where: { connectionId, name: "list_issues" },
			data: { reviewState: "CHANGED" },
		});
		try {
			expect(
				await authorizeMcpTool(
					platformSlug,
					context("list_issues", "changed-tool"),
				),
			).toEqual({
				type: "denied",
				reason: "The MCP tool changed after deployment.",
			});
		} finally {
			await db.mcpToolSnapshot.updateMany({
				where: { connectionId, name: "list_issues" },
				data: { reviewState: "REVIEWED" },
			});
		}
	});

	it("denies a change through a read-only connection", async () => {
		await db.mcpConnection.update({
			where: { id: connectionId },
			data: { accessMode: "READ_ONLY" },
		});
		try {
			expect(
				await authorizeMcpTool(
					platformSlug,
					context("create_issue", "read-only-change"),
				),
			).toEqual({
				type: "denied",
				reason: "The MCP connection is read-only.",
			});
		} finally {
			await db.mcpConnection.update({
				where: { id: connectionId },
				data: { accessMode: "READ_WRITE" },
			});
		}
	});

	it("denies the next call after disconnect", async () => {
		await db.mcpConnection.update({
			where: { id: connectionId },
			data: { status: "DISCONNECTED" },
		});
		try {
			expect(
				await authorizeMcpTool(
					platformSlug,
					context("list_issues", "after-disconnect"),
				),
			).toEqual({
				type: "denied",
				reason: "The MCP platform is disconnected.",
			});
		} finally {
			await db.mcpConnection.update({
				where: { id: connectionId },
				data: { status: "CONNECTED" },
			});
		}
	});

	it("records one change and denies its replay", async () => {
		const approvalContext = context("create_issue", "change-once");

		expect(await authorizeMcpTool(platformSlug, approvalContext)).toBe(
			"approved",
		);
		expect(await authorizeMcpTool(platformSlug, approvalContext)).toEqual({
			type: "denied",
			reason: "This MCP change already ran.",
		});
		expect(
			await db.agentAction.count({
				where: { idempotencyKey: `${runId}:change-once` },
			}),
		).toBe(1);
	});
});
