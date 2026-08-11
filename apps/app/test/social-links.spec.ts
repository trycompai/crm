import { describe, expect, it } from "bun:test";
import { safeExternalHref } from "../lib/safe-external-url";
import { contactSocialLinks } from "../lib/social-links";

describe("safe external links", () => {
	it("normalizes http links and drops active content URLs", () => {
		expect(safeExternalHref("linkedin.com/in/ada")).toBe(
			"https://linkedin.com/in/ada",
		);
		expect(safeExternalHref("javascript:alert(1)")).toBeNull();
		expect(
			safeExternalHref("data:text/html,<script>alert(1)</script>"),
		).toBeNull();
		expect(safeExternalHref("/settings")).toBeNull();
		expect(safeExternalHref("https://user:pass@example.com")).toBeNull();
	});

	it("does not render unsafe stored social values", () => {
		const rows = contactSocialLinks({
			linkedinUrl: "javascript:alert(1)",
			twitterUrl: "https://x.com/ada",
			githubUrl: "data:text/html,<script>alert(1)</script>",
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]?.href).toBe("https://x.com/ada");
	});
});
