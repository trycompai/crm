import { isWorkspaceAdmin, WORKSPACE_ID } from "@crm/auth";
import { type Db, type Prisma } from "@crm/db";
import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

export type KernelDb = Db | Prisma.TransactionClient;

export type KernelMember = {
	userId: string;
	role: string;
	isAdmin: boolean;
};

@Injectable()
export class OperatingKernelAccessService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async assertMember(
		userId: string,
		client: KernelDb = this.db,
	): Promise<KernelMember> {
		const member = await client.member.findUnique({
			where: {
				organizationId_userId: { organizationId: WORKSPACE_ID, userId },
			},
			select: { role: true },
		});

		if (!member) {
			throw new ForbiddenException("You are not a member of this workspace.");
		}

		const role =
			member.role === "owner" ||
			member.role === "admin" ||
			member.role === "member"
				? member.role
				: "member";

		return {
			userId,
			role,
			isAdmin: isWorkspaceAdmin(role),
		};
	}

	async assertAdmin(
		userId: string,
		client: KernelDb = this.db,
	): Promise<KernelMember> {
		const member = await this.assertMember(userId, client);
		if (!member.isAdmin) {
			throw new ForbiddenException(
				"Only a workspace owner or admin can do that.",
			);
		}
		return member;
	}

	async assertCanActOnWork(
		userId: string,
		ownerId: string | null,
		client: KernelDb = this.db,
	): Promise<KernelMember> {
		const member = await this.assertMember(userId, client);
		if (!member.isAdmin && ownerId !== userId) {
			throw new ForbiddenException(
				"You can only transition work assigned to you.",
			);
		}
		return member;
	}

	async assertAssignmentTarget(
		userId: string,
		client: KernelDb = this.db,
	): Promise<void> {
		const member = await client.member.findUnique({
			where: {
				organizationId_userId: { organizationId: WORKSPACE_ID, userId },
			},
			select: { id: true },
		});
		if (!member) {
			throw new ForbiddenException("The assignee is not a workspace member.");
		}
	}
}
