import {
	canChangeRole,
	canRenameWorkspace,
	ensureWorkspaceMembership,
	isWorkspaceRole,
	WORKSPACE_ID,
	type WorkspaceRole,
	workspaceRoleOf,
} from "@crm/auth";
import type { Db, Prisma } from "@crm/db";
import { isOnboarded, markOnboarded, workspaceSlug } from "@crm/db/workspace";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { normalizeDomain } from "../companies/domain";
import { InjectDatabase } from "../database/database.constants";
import {
	countsByKey,
	FACET_ALL,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	MemberListInput,
	SetMemberRoleInput,
	UpdateWorkspaceInput,
} from "./workspace.contracts";

export interface Workspace {
	id: string;
	slug: string;
	name: string;
	website: string | null;
	onboarded: boolean;
	viewerRole: WorkspaceRole | null;
	canRename: boolean;
	canChangeRoles: boolean;
}

export interface WorkspaceMember {
	id: string;
	userId: string;
	name: string;
	email: string;
	image: string | null;
	role: WorkspaceRole;
	joinedAt: string;
	isViewer: boolean;
}

const MEMBER_SELECT = {
	id: true,
	role: true,
	createdAt: true,
	userId: true,
	user: { select: { name: true, email: true, image: true } },
} as const;

type MemberRow = Prisma.MemberGetPayload<{ select: typeof MEMBER_SELECT }>;

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.MemberOrderByWithRelationInput
> = {
	name: (dir) => ({ user: { name: dir } }),
	email: (dir) => ({ user: { email: dir } }),
	role: (dir) => ({ role: dir }),
	joinedAt: (dir) => ({ createdAt: dir }),
};

function toRole(value: string): WorkspaceRole {
	return isWorkspaceRole(value) ? value : "member";
}

@Injectable()
export class WorkspaceService {
	private readonly logger = new Logger(WorkspaceService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async get(userId: string): Promise<Workspace> {
		let row = await this.readWorkspace();

		if (!row) {
			await ensureWorkspaceMembership(userId);
			row = await this.readWorkspace();
		}

		if (!row) {
			throw new ServiceUnavailableException(
				"The workspace could not be read. Sign in again in a moment.",
			);
		}

		const role = await workspaceRoleOf(userId);

		return {
			id: row.id,
			slug: row.slug,
			name: row.name,
			website: row.website,
			onboarded: isOnboarded(row.metadata),
			viewerRole: role,
			canRename: canRenameWorkspace(role),
			canChangeRoles: canChangeRole(role),
		};
	}

	async update(
		userId: string,
		input: UpdateWorkspaceInput,
	): Promise<Workspace> {
		const role = await workspaceRoleOf(userId);

		if (!canRenameWorkspace(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can change the workspace.",
			);
		}

		const before = await this.db.organization.findUnique({
			where: { id: WORKSPACE_ID },
			select: { website: true, metadata: true },
		});

		const website = normalizeDomain(input.website);

		if (!website) {
			throw new BadRequestException(
				"That is not a website. Enter the domain, like acme.com.",
			);
		}

		await this.db.organization.update({
			where: { id: WORKSPACE_ID },
			data: {
				name: input.name,
				slug: workspaceSlug(input.slug ?? input.name),
				website,
				metadata: markOnboarded(before?.metadata ?? null, new Date()),
			},
		});

		this.logger.log({ message: "Workspace updated", userId });

		if (website !== before?.website) {
			await this.agent.workspaceChanged(
				website,
				before?.website
					? "The company using this CRM changed its website"
					: "The company using this CRM said what its website is",
			);
		}

		return this.get(userId);
	}

	async members(
		userId: string,
		input: MemberListInput,
	): Promise<ListResult<WorkspaceMember>> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);

		const [rows, total, roles] = await Promise.all([
			this.db.member.findMany({
				where,
				skip,
				take,
				select: MEMBER_SELECT,
				orderBy: resolveOrderBy(input, SORTABLE, { createdAt: "asc" }),
			}),
			this.db.member.count({ where }),
			this.db.member.groupBy({
				by: ["role"],
				where: this.searchWhere(input.q),
				_count: { _all: true },
			}),
		]);

		return {
			rows: rows.map((row) => this.toMember(row, userId)),
			total,
			facetCounts: { role: countsByKey(roles, "role") },
		};
	}

	async setMemberRole(
		userId: string,
		input: SetMemberRoleInput,
	): Promise<WorkspaceMember> {
		const role = await workspaceRoleOf(userId);

		if (!canChangeRole(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can change a member's role.",
			);
		}

		const updated = await this.db.$transaction(async (tx) => {
			const target = await tx.member.findFirst({
				where: { id: input.memberId, organizationId: WORKSPACE_ID },
				select: { id: true, role: true },
			});

			if (!target) {
				throw new NotFoundException("That person is not in this workspace.");
			}

			if (target.role === "owner" && input.role !== "owner") {
				const owners = await tx.$queryRaw<{ id: string }[]>`
					SELECT id FROM "member"
					WHERE "organizationId" = ${WORKSPACE_ID} AND role = 'owner'
					FOR UPDATE
				`;

				if (owners.length <= 1) {
					throw new ForbiddenException(
						"The workspace needs an owner. Make someone else an owner first.",
					);
				}
			}

			return tx.member.update({
				where: { id: target.id },
				data: { role: input.role },
				select: MEMBER_SELECT,
			});
		});

		this.logger.log({
			message: "Workspace role changed",
			userId,
			memberId: updated.id,
			role: input.role,
		});

		return this.toMember(updated, userId);
	}

	private toMember(row: MemberRow, userId: string): WorkspaceMember {
		return {
			id: row.id,
			userId: row.userId,
			name: row.user.name,
			email: row.user.email,
			image: row.user.image,
			role: toRole(row.role),
			joinedAt: row.createdAt.toISOString(),
			isViewer: row.userId === userId,
		};
	}

	private searchWhere(q: string): Prisma.MemberWhereInput {
		const term = q.trim();
		const where: Prisma.MemberWhereInput = { organizationId: WORKSPACE_ID };

		if (term) {
			where.user = {
				OR: [
					{ name: { contains: term, mode: "insensitive" } },
					{ email: { contains: term, mode: "insensitive" } },
				],
			};
		}

		return where;
	}

	private buildWhere(input: MemberListInput): Prisma.MemberWhereInput {
		const where = this.searchWhere(input.q);

		if (input.role !== FACET_ALL) {
			where.role = input.role;
		}

		return where;
	}

	private async readWorkspace() {
		return this.db.organization.findUnique({
			where: { id: WORKSPACE_ID },
			select: {
				id: true,
				slug: true,
				name: true,
				website: true,
				metadata: true,
			},
		});
	}
}
