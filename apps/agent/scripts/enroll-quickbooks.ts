import "@crm/env/load";
import { db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { z } from "zod";
import { quickBooksCompany, quickBooksTokens } from "../agent/lib/quickbooks";
import { QUICKBOOKS, quickBooksConfig } from "../agent/lib/quickbooks-config";
import { sealQuickBooksTokens } from "../agent/lib/quickbooks-store";

const enrollment = z.object({
	ownerId: z.string().min(1),
	companyName: z.string().min(1),
	tokens: quickBooksTokens,
});

async function enroll(): Promise<void> {
	if (process.env.QUICKBOOKS_ENABLED === "true") {
		throw new Error("Disable QuickBooks and redeploy before enrollment.");
	}
	const config = quickBooksConfig();
	if (!config)
		throw new Error("QuickBooks configuration is missing or invalid.");
	const parsed = enrollment.safeParse(JSON.parse(await Bun.stdin.text()));
	if (!parsed.success) throw new Error("Invalid enrollment input.");
	const input = parsed.data;
	const member = await db.member.findUnique({
		where: {
			organizationId_userId: {
				organizationId: WORKSPACE_ID,
				userId: input.ownerId,
			},
		},
	});
	if (
		!member?.role
			.split(",")
			.map((role) => role.trim())
			.includes("owner")
	) {
		throw new Error("Enrollment requires the workspace owner.");
	}
	const response = await fetch(
		`${QUICKBOOKS.hosts[config.environment]}/v3/company/${config.realmId}/companyinfo/${config.realmId}`,
		{
			headers: {
				Authorization: `Bearer ${input.tokens.accessToken}`,
				Accept: "application/json",
			},
			redirect: "error",
			signal: AbortSignal.timeout(QUICKBOOKS.requestTimeoutMs),
		},
	);
	if (!response.ok)
		throw new Error(
			`QuickBooks company verification failed (${response.status}).`,
		);
	const company = quickBooksCompany.safeParse(await response.json());
	if (
		!company.success ||
		company.data.CompanyInfo.CompanyName !== input.companyName
	) {
		throw new Error(
			"QuickBooks company name does not match the owner's enrollment input.",
		);
	}
	const data = {
		realmId: config.realmId,
		environment: config.environment,
		encryptedTokens: sealQuickBooksTokens(input.tokens, config),
		enrolledBy: input.ownerId,
		verifiedAt: new Date(),
	};
	await db.quickBooksConnection.upsert({
		where: { id: QUICKBOOKS.connectionId },
		create: { id: QUICKBOOKS.connectionId, ...data },
		update: data,
	});
	console.log(
		"QuickBooks enrollment is verified. QuickBooks remains disabled until the owner enables the deployment.",
	);
}

try {
	await enroll();
} catch {
	console.error(
		"QuickBooks enrollment failed. Check owner membership, configuration, OAuth credentials, and company name. No credentials are logged.",
	);
	process.exitCode = 1;
} finally {
	await db.$disconnect();
}
