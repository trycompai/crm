import { describe, expect, it } from "bun:test";
import { restoreDetailSheetFocus } from "../components/detail-sheet";

describe("detail sheet focus restoration", () => {
	it("restores focus to a connected opener", () => {
		let focused = false;
		let prevented = false;
		const opener = {
			isConnected: true,
			focus: () => {
				focused = true;
			},
		};

		expect(
			restoreDetailSheetFocus(opener, {
				preventDefault: () => {
					prevented = true;
				},
			}),
		).toBe(true);
		expect(focused).toBe(true);
		expect(prevented).toBe(true);
	});

	it("does not focus a disconnected opener", () => {
		let focused = false;
		let prevented = false;
		const opener = {
			isConnected: false,
			focus: () => {
				focused = true;
			},
		};

		expect(
			restoreDetailSheetFocus(opener, {
				preventDefault: () => {
					prevented = true;
				},
			}),
		).toBe(false);
		expect(focused).toBe(false);
		expect(prevented).toBe(false);
	});

	it("does nothing when a direct URL has no opener", () => {
		let prevented = false;

		expect(
			restoreDetailSheetFocus(null, {
				preventDefault: () => {
					prevented = true;
				},
			}),
		).toBe(false);
		expect(prevented).toBe(false);
	});
});
