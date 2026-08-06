import {
	isWorkspaceAdmin,
	isWorkspaceRole,
	WORKSPACE_ID,
	type WorkspaceRole,
} from "@crm/auth";
import type { Db } from "@crm/db";
import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { canReadAgent, isPrivateAgentDraft } from "./agent-visibility";

@Injectable()
export class AgentAccessService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async assertMember(userId: string): Promise<WorkspaceRole> {
		const member = await this.db.member.findUnique({
			where: {
				organizationId_userId: { organizationId: WORKSPACE_ID, userId },
			},
			select: { role: true },
		});

		if (!member) {
			throw new ForbiddenException("You are not a member of this workspace.");
		}

		return isWorkspaceRole(member.role) ? member.role : "member";
	}

	async assertCanManage(agentId: string, userId: string) {
		const [role, agent] = await Promise.all([
			this.assertMember(userId),
			this.db.agentDefinition.findFirst({
				where: { id: agentId, status: { not: "DELETED" } },
				select: {
					id: true,
					createdById: true,
					status: true,
					name: true,
					description: true,
				},
			}),
		]);

		if (!agent) {
			throw new NotFoundException(`No agent with id ${agentId}.`);
		}

		if (isPrivateAgentDraft(agent.status) && agent.createdById !== userId) {
			throw new NotFoundException(`No agent with id ${agentId}.`);
		}

		if (agent.createdById !== userId && !isWorkspaceAdmin(role)) {
			throw new ForbiddenException(
				"Only the creator or a workspace admin can change this agent.",
			);
		}

		return agent;
	}

	async assertCanRead(agentId: string, userId: string) {
		await this.assertMember(userId);
		const agent = await this.db.agentDefinition.findFirst({
			where: { id: agentId, status: { not: "DELETED" } },
			select: {
				id: true,
				createdById: true,
				status: true,
				currentVersionId: true,
			},
		});

		if (!agent || !canReadAgent(agent.status, agent.createdById, userId)) {
			throw new NotFoundException(`No agent with id ${agentId}.`);
		}

		return agent;
	}
}
