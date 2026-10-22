import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db, type Prisma } from "@crm/db";
import {
	DEFAULT_AGENT_MODEL,
	readAgentModel,
	SETTINGS_ID,
	writeAgentModel,
} from "@crm/db/settings";
import { selectedModel } from "../agent/lib/model";

async function clear() {
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
}

/**
 * The row holds the Context key a rep typed and the model they chose, and
 * DATABASE_URL is somebody's working database. Deleting it and not putting it
 * back sends them through the research-key gate again with nothing saying why.
 */
let saved: Prisma.AppSettingUncheckedCreateInput | null = null;

beforeAll(async () => {
	saved = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });
});

beforeEach(clear);
afterEach(clear);

afterAll(async () => {
	if (saved) await db.appSetting.create({ data: saved });
});

describe("the configured model", () => {
	it("falls back when nothing has ever been chosen", async () => {
		const setting = await readAgentModel(db);

		expect(setting.id).toBe(DEFAULT_AGENT_MODEL.id);
		expect(setting.isDefault).toBe(true);

		expect(await selectedModel()).toEqual({
			model: DEFAULT_AGENT_MODEL.id,
			modelContextWindowTokens: DEFAULT_AGENT_MODEL.contextWindowTokens,
		});
	});

	it("returns the chosen model with its own context window", async () => {
		await writeAgentModel(db, {
			id: "anthropic/claude-sonnet-5",
			contextWindowTokens: 200_000,
		});

		expect(await selectedModel()).toEqual({
			model: "anthropic/claude-sonnet-5",
			modelContextWindowTokens: 200_000,
		});
	});

	it("goes back to the fallback when the choice is cleared", async () => {
		await writeAgentModel(db, {
			id: "anthropic/claude-sonnet-5",
			contextWindowTokens: 200_000,
		});
		await writeAgentModel(db, null);

		expect(await selectedModel()).toEqual({
			model: DEFAULT_AGENT_MODEL.id,
			modelContextWindowTokens: DEFAULT_AGENT_MODEL.contextWindowTokens,
		});
		expect((await readAgentModel(db)).isDefault).toBe(true);
	});

	it("keeps one row rather than accumulating one per change", async () => {
		await writeAgentModel(db, { id: "openai/gpt-5.5", contextWindowTokens: 1 });
		await writeAgentModel(db, { id: "zai/glm-5.2", contextWindowTokens: 2 });

		expect(await db.appSetting.count()).toBe(1);
		expect((await readAgentModel(db)).id).toBe("zai/glm-5.2");
	});
});
