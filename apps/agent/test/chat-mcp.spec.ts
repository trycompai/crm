import { describe, expect, it } from "bun:test";
import { vendors } from "@crm/mcp-integrations/catalog";
import {
	buildChatMcpConnections,
	chatCallApprovalStatus,
	connectionRequestStatus,
} from "../agent/lib/chat-mcp";

describe("chat MCP connections", () => {
	it("describes the connection state for the chat card", () => {
		expect(connectionRequestStatus(null)).toBe("not_connected");
		expect(
			connectionRequestStatus({ status: "CONNECTED", lastErrorCode: null }),
		).toBe("connected");
		expect(
			connectionRequestStatus({
				status: "ERROR",
				lastErrorCode: "invalid_grant",
			}),
		).toBe("needs_reauth");
		expect(
			connectionRequestStatus({
				status: "ERROR",
				lastErrorCode: "discovery_failed",
			}),
		).toBe("error");
	});

	it("runs reads without approval", () => {
		expect(chatCallApprovalStatus("read", "READ_ONLY", "manual")).toBe(
			"approved",
		);
	});

	it("asks before manual changes", () => {
		expect(chatCallApprovalStatus("change", "READ_WRITE", "manual")).toBe(
			"user-approval",
		);
	});

	it("asks before risky automatic changes", () => {
		expect(chatCallApprovalStatus("risky", "READ_WRITE", "auto")).toBe(
			"user-approval",
		);
	});

	it("marks bypassed risky changes", () => {
		expect(chatCallApprovalStatus("risky", "READ_WRITE", "bypass")).toEqual({
			type: "approved",
			reason: "risky",
		});
	});

	it("denies writes through read-only connections", () => {
		expect(chatCallApprovalStatus("change", "READ_ONLY", "bypass")).toEqual({
			type: "denied",
			reason: "The MCP connection is read-only.",
		});
	});

	it("exposes only reviewed tools from a connected platform", () => {
		const vendor = vendors[0];
		if (!vendor) throw new Error("The MCP catalog is empty.");
		const connections = buildChatMcpConnections(
			[vendor],
			[
				{
					id: "connection-1",
					platformSlug: vendor.slug,
					status: "CONNECTED",
					accessMode: "READ_WRITE",
					lastErrorCode: null,
					toolSnapshots: [{ name: "list_projects", callKind: "read" }],
				},
			],
			"user-1",
		);

		expect(connections[vendor.slug]).toMatchObject({
			instanceKey: "connection-1:read_write",
			tools: { allow: ["list_projects"] },
			url: vendor.access.read_write.url,
		});
	});
});
