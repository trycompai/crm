import { describe, expect, it } from "bun:test";
import {
	conferenceUrl,
	eventTime,
	type GoogleEvent,
} from "../src/google/calendar.client";

describe("eventTime", () => {
	it("parses a timed event", () => {
		const parsed = eventTime({ dateTime: "2026-08-15T14:30:00Z" });
		expect(parsed?.isAllDay).toBe(false);
		expect(parsed?.at.toISOString()).toBe("2026-08-15T14:30:00.000Z");
	});

	it("parses an all-day event as UTC midnight", () => {
		const parsed = eventTime({ date: "2026-08-15" });
		expect(parsed?.isAllDay).toBe(true);
		expect(parsed?.at.toISOString()).toBe("2026-08-15T00:00:00.000Z");
	});

	it("rejects empty and invalid values", () => {
		expect(eventTime(undefined)).toBeNull();
		expect(eventTime({})).toBeNull();
		expect(eventTime({ dateTime: "not-a-date" })).toBeNull();
	});
});

describe("conferenceUrl", () => {
	it("prefers hangoutLink", () => {
		const event: GoogleEvent = {
			hangoutLink: "https://meet.google.com/abc",
			conferenceData: {
				entryPoints: [
					{ entryPointType: "video", uri: "https://zoom.example/x" },
				],
			},
		};
		expect(conferenceUrl(event)).toBe("https://meet.google.com/abc");
	});

	it("falls back to the video conference entry", () => {
		const event: GoogleEvent = {
			conferenceData: {
				entryPoints: [
					{ entryPointType: "phone", uri: "tel:+1555" },
					{ entryPointType: "video", uri: "https://zoom.example/x" },
				],
			},
		};
		expect(conferenceUrl(event)).toBe("https://zoom.example/x");
	});

	it("returns null when nothing is present", () => {
		expect(conferenceUrl({})).toBeNull();
	});
});
