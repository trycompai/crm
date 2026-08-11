import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prospectNextAction } from "../components/crm/prospect-next-action";

const appRoot = resolve(import.meta.dir, "..");
const prospectsTable = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/prospects/prospects-table.tsx"),
	"utf8",
);
const prospectSheet = readFileSync(
	resolve(appRoot, "components/crm/record-sheet/prospect-sheet.tsx"),
	"utf8",
);
const dataTable = readFileSync(
	resolve(appRoot, "../../packages/ui/src/components/data-table.tsx"),
	"utf8",
);
const rowAccent = readFileSync(
	resolve(appRoot, "../../packages/ui/src/lib/row-accent.ts"),
	"utf8",
);

test("prospect table and sheet show readiness from the API read model", () => {
	expect(prospectsTable).toContain('id: "readiness"');
	expect(prospectsTable).toContain("row.readiness.passed");
	expect(prospectsTable).toContain("row.readiness.gaps[0]?.label");
	expect(prospectSheet).toContain("prospect.readiness.gates.map");
	expect(prospectSheet).toContain("prospect.readiness.actions.canApproveRoute");
	expect(prospectSheet).toContain(
		"prospect.readiness.actions.canPrepareSequence",
	);
	expect(prospectSheet).toContain(
		"prospect.readiness.actions.canApproveSequence",
	);
	expect(prospectSheet).toContain("executionDisabledReason");
});

test("prospect next action prioritizes governed outreach readiness", () => {
	const base = {
		companyId: "company-id",
		contactId: "contact-id",
		dealCount: 0,
		enrichmentStatus: "COMPLETE" as const,
		hasDraft: true,
		jobPostingCount: 1,
		namedPerson: "Alex Ready",
		queued: false,
		role: "Operations Director",
		routeStatus: "DIRECT_ROUTE_REVIEW",
		status: "PROMOTED",
	};

	expect(
		prospectNextAction({
			...base,
			readiness: {
				state: "permission_needed",
				summary: "Route needs approval",
				actions: {
					canApproveRoute: true,
					canPrepareSequence: false,
					canApproveSequence: false,
				},
			},
		}).label,
	).toBe("Approve route");
	expect(
		prospectNextAction({
			...base,
			routeStatus: "SEND_READY_REVIEW",
			readiness: {
				state: "sequence_needed",
				summary: "A/B/C drafts missing",
				actions: {
					canApproveRoute: false,
					canPrepareSequence: true,
					canApproveSequence: false,
				},
			},
		}).label,
	).toBe("Prepare sequence");
});

test("clickable data table rows can be opened by keyboard", () => {
	expect(dataTable).toContain("tabIndex={clickable ? 0 : undefined}");
	expect(dataTable).toContain("onKeyDown={clickable ? handleRowKeyDown");
	expect(dataTable).toContain('event.key !== "Enter"');
	expect(dataTable).toContain('event.key !== " "');
	expect(dataTable).toContain("isInteractiveTarget(event.target)");
	expect(rowAccent).toContain("focus-visible:ring");
	expect(rowAccent).toContain("[&:focus-visible>td:first-child]:before");
});
