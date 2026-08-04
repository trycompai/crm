import { db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";

export { WORKSPACE_ID };

export const WORKSPACE_SLUG = "workspace";

export const DEFAULT_WORKSPACE_NAME = "CRM";

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
	return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isWorkspaceAdmin(role: WorkspaceRole | null): boolean {
	return role === "owner" || role === "admin";
}

export function canRenameWorkspace(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canChangeRole(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export async function ensureWorkspaceMembership(
	userId: string,
): Promise<string | undefined> {
	try {
		return await db.$transaction(async (tx) => {
			const workspace = await tx.organization.upsert({
				where: { id: WORKSPACE_ID },
				create: {
					id: WORKSPACE_ID,
					name: DEFAULT_WORKSPACE_NAME,
					slug: WORKSPACE_SLUG,
					createdAt: new Date(),
				},
				update: {},
				select: { id: true },
			});

			const enrolled = await tx.member.count({
				where: { organizationId: workspace.id },
			});

			if (enrolled === 0) {
				const existing = await tx.user.findMany({
					select: { id: true },
					orderBy: [{ createdAt: "asc" }, { id: "asc" }],
				});

				await tx.member.createMany({
					data: existing.map((user, index) => ({
						id: crypto.randomUUID(),
						organizationId: workspace.id,
						userId: user.id,
						role: index === 0 ? "owner" : "member",
						createdAt: new Date(),
					})),
					skipDuplicates: true,
				});
			}

			await tx.member.upsert({
				where: {
					organizationId_userId: { organizationId: workspace.id, userId },
				},
				create: {
					id: crypto.randomUUID(),
					organizationId: workspace.id,
					userId,
					role: "member",
					createdAt: new Date(),
				},
				update: {},
			});

			return workspace.id;
		});
	} catch (error) {
		console.error(
			`[auth] could not enrol user ${userId} in workspace ${WORKSPACE_ID}; the next sign-in will retry`,
			error,
		);
		return undefined;
	}
}
