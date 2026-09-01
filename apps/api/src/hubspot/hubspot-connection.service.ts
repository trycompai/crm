import {
	canManageConnections,
	HUBSPOT_PROVIDER_ID,
	hubspotCanReadDeals,
	isHubspotConfigured,
} from "@crm/auth";
import type { Db } from "@crm/db";
import { forgetHubspot, splitScopes } from "@crm/db/hubspot";
import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { AgentAccessService } from "../agent/agent-access.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	HubspotDisconnectResult,
	HubspotStatus,
} from "./hubspot.contracts";

@Injectable()
export class HubspotConnectionService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: AgentAccessService,
	) {}

	async status(userId: string): Promise<HubspotStatus> {
		const role = await this.access.assertMember(userId);

		const [connection, pipelines] = await Promise.all([
			this.db.hubspotConnection.findFirst({ orderBy: { updatedAt: "desc" } }),
			this.db.hubspotPipeline.findMany({
				orderBy: { label: "asc" },
				select: {
					id: true,
					label: true,
					stages: {
						orderBy: { displayOrder: "asc" },
						select: { id: true, label: true, outcome: true },
					},
				},
			}),
		]);

		const scopes = splitScopes(connection?.scopes);

		return {
			configured: isHubspotConfigured(),
			connected: Boolean(connection),
			canManage: canManageConnections(role),
			portalId: connection?.portalId ?? null,
			portalDomain: connection?.portalDomain ?? null,
			installerEmail: connection?.installerEmail ?? null,
			scopes,
			canReadDeals: connection ? hubspotCanReadDeals(scopes) : false,
			connectedAt: connection?.createdAt.toISOString() ?? null,
			lastReadAt: connection?.lastReadAt?.toISOString() ?? null,
			lastError: connection?.lastError ?? null,
			lastErrorAt: connection?.lastErrorAt?.toISOString() ?? null,
			revokedAt: connection?.revokedAt?.toISOString() ?? null,
			pipelines,
		};
	}

	async disconnect(userId: string): Promise<HubspotDisconnectResult> {
		const role = await this.access.assertMember(userId);

		if (!canManageConnections(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can disconnect HubSpot.",
			);
		}

		const connection = await this.db.hubspotConnection.findFirst({
			select: { id: true },
		});
		if (!connection) throw new NotFoundException("HubSpot is not connected.");

		await this.db.account.deleteMany({
			where: { providerId: HUBSPOT_PROVIDER_ID },
		});
		await forgetHubspot();

		return { disconnected: true };
	}
}
