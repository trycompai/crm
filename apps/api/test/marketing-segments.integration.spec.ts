import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { MarketingSegmentsService } from "../src/marketing/marketing-segments.service";

const TAG = `segment${Date.now()}`;

const segments = new MarketingSegmentsService(db);

async function clean() {
	await db.marketingSegment.deleteMany({ where: { name: { contains: TAG } } });
}

async function make() {
	const created = await segments.create({
		name: `${TAG} ${Math.random()}`,
		definition: { facet: { facet: "contact.hasEmail" } },
	});

	return created.id;
}

function read(id: string) {
	return db.marketingSegment.findUnique({
		where: { id },
		select: { definition: true, kind: true },
	});
}

beforeAll(clean);
afterAll(clean);

describe("a segment update", () => {
	it("clears the rules when the editor sends none", async () => {
		const id = await make();

		await segments.update({ id, definition: null });

		const row = await read(id);
		expect(row?.definition).toBeNull();
		expect(row?.kind).toBe("STATIC");
	});

	it("keeps the rules when the editor sends only a name", async () => {
		const id = await make();

		await segments.update({ id, name: `${TAG} renamed` });

		const row = await read(id);
		expect(row?.definition).toEqual({ facet: { facet: "contact.hasEmail" } });
		expect(row?.kind).toBe("DYNAMIC");
	});
});

describe("a segment name collision", () => {
	it("rejects a create that reuses a name", async () => {
		const name = `${TAG} taken`;
		await segments.create({ name });

		await expect(segments.create({ name })).rejects.toThrow(
			`Another segment is already named ${name}.`,
		);
	});

	it("rejects a rename onto an existing name", async () => {
		const name = `${TAG} occupied`;
		await segments.create({ name });
		const id = await make();

		await expect(segments.update({ id, name })).rejects.toThrow(
			`Another segment is already named ${name}.`,
		);
	});
});
