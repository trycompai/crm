import { describe, expect, it } from "bun:test";
import { approvalContentDigest } from "@crm/db/approval";
import { approvalDigestMatches } from "../src/approval/approval.service";
import { workCapabilities } from "../src/work/work-capabilities";

describe("approval and Work pure policy projections", () => {
	it("recognizes a valid digest and marks invalidation as stale", () => {
		const approval = {
			action: "outreach.send",
			contentSnapshot: { body: "review" },
			targetType: "COMPANY" as const,
			targetId: "company-1",
			risk: "LOW" as const,
			policyVersion: "v1",
			expiresAt: new Date("2030-01-01T00:00:00.000Z"),
			invalidationVersion: 0,
		};
		const contentDigest = approvalContentDigest(approval);
		expect(approvalDigestMatches({ ...approval, contentDigest })).toBe(true);
		expect(
			approvalDigestMatches({
				...approval,
				contentDigest,
				invalidationVersion: 1,
			}),
		).toBe(false);
	});

	it("projects the four Work authority personas without UI inference", () => {
		expect(
			workCapabilities({
				state: "OPEN",
				ownerId: null,
				userId: "member",
				isAdmin: false,
			}),
		).toEqual({
			canClaim: true,
			canAssign: false,
			canStart: false,
			canWait: false,
			canBlock: false,
			canComplete: false,
			canDismiss: false,
		});
		expect(
			workCapabilities({
				state: "OPEN",
				ownerId: "member",
				userId: "member",
				isAdmin: false,
			}),
		).toMatchObject({
			canClaim: false,
			canStart: true,
			canWait: true,
			canBlock: true,
			canComplete: true,
			canDismiss: true,
		});
		expect(
			workCapabilities({
				state: "OPEN",
				ownerId: "foreign",
				userId: "member",
				isAdmin: false,
			}),
		).toEqual({
			canClaim: false,
			canAssign: false,
			canStart: false,
			canWait: false,
			canBlock: false,
			canComplete: false,
			canDismiss: false,
		});
		expect(
			workCapabilities({
				state: "OPEN",
				ownerId: "foreign",
				userId: "admin",
				isAdmin: true,
			}),
		).toEqual({
			canClaim: false,
			canAssign: true,
			canStart: true,
			canWait: true,
			canBlock: true,
			canComplete: true,
			canDismiss: true,
		});
	});
});
