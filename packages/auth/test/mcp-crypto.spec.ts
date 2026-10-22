import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createMcpSecretBox } from "../src/mcp-crypto";

describe("MCP secret encryption", () => {
	test("stays disabled without a valid key", () => {
		const previous = process.env.MCP_ENCRYPTION_KEY;
		delete process.env.MCP_ENCRYPTION_KEY;
		try {
			expect(createMcpSecretBox()).toBeUndefined();
			expect(createMcpSecretBox("invalid")).toBeUndefined();
		} finally {
			if (previous === undefined) delete process.env.MCP_ENCRYPTION_KEY;
			else process.env.MCP_ENCRYPTION_KEY = previous;
		}
	});

	test("encrypts and decrypts one purpose", () => {
		const box = createMcpSecretBox(randomBytes(32).toString("base64"));
		expect(box).toBeDefined();
		if (!box) throw new Error("Secret box is missing");

		const encrypted = box.encrypt("access-token", "linear:access");
		expect(encrypted).not.toContain("access-token");
		expect(box.decrypt(encrypted, "linear:access")).toBe("access-token");
	});

	test("rejects another purpose and changed ciphertext", () => {
		const box = createMcpSecretBox(randomBytes(32).toString("base64"));
		expect(box).toBeDefined();
		if (!box) throw new Error("Secret box is missing");

		const encrypted = box.encrypt("refresh-token", "linear:refresh");
		expect(() => box.decrypt(encrypted, "linear:access")).toThrow();
		expect(() => box.decrypt(`${encrypted}x`, "linear:refresh")).toThrow();
	});
});
