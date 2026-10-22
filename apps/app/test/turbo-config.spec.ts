import { describe, expect, it } from "bun:test";
import turboConfig from "../turbo.json";

describe("app build environment", () => {
	it("extends the root build environment with the public auth URL", () => {
		expect(turboConfig.tasks.build.env).toEqual([
			"$TURBO_EXTENDS$",
			"NEXT_PUBLIC_AUTH_URL",
		]);
	});
});
