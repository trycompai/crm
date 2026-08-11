import { WORKSPACE_ID } from "@crm/auth";
import { type Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	KernelSubjectType,
	SubjectRef,
	SubjectSummary,
} from "./operating-kernel.contracts";
import type { KernelDb } from "./operating-kernel-access.service";

function key(ref: SubjectRef): string {
	return `${ref.type}:${ref.id}`;
}

function contactLabel(firstName: string, lastName: string | null): string {
	return [firstName, lastName].filter(Boolean).join(" ");
}

@Injectable()
export class SubjectResolverService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async resolveOne(
		ref: SubjectRef,
		client: KernelDb = this.db,
	): Promise<SubjectSummary> {
		const [summary] = await this.resolveMany([ref], client);
		return summary ?? { ...ref, label: null, missing: true };
	}

	async resolveMany(
		refs: readonly SubjectRef[],
		client: KernelDb = this.db,
	): Promise<SubjectSummary[]> {
		const unique = new Map(refs.map((ref) => [key(ref), ref]));
		const values = [...unique.values()];
		const byType = (type: KernelSubjectType) =>
			values.filter((ref) => ref.type === type).map((ref) => ref.id);

		const [
			workspaces,
			users,
			companies,
			contacts,
			prospects,
			deals,
			drafts,
			workItems,
			accounts,
			instances,
			providerAccounts,
			campaigns,
			contentItems,
			contentVariants,
			experiments,
			socialMentions,
			supportCases,
			providerResources,
			plans,
			controlCommands,
			providerOperations,
		] = await Promise.all([
			client.organization.findMany({
				where: {
					id: { in: byType("WORKSPACE").filter((id) => id === WORKSPACE_ID) },
				},
				select: { id: true, name: true },
			}),
			client.member.findMany({
				where: {
					organizationId: WORKSPACE_ID,
					userId: { in: byType("USER") },
				},
				select: { user: { select: { id: true, name: true } } },
			}),
			client.company.findMany({
				where: { id: { in: byType("COMPANY") } },
				select: { id: true, name: true },
			}),
			client.contact.findMany({
				where: { id: { in: byType("CONTACT") } },
				select: { id: true, firstName: true, lastName: true },
			}),
			client.prospect.findMany({
				where: { id: { in: byType("PROSPECT") } },
				select: { id: true, companyName: true, namedPerson: true },
			}),
			client.deal.findMany({
				where: { id: { in: byType("DEAL") } },
				select: { id: true, name: true },
			}),
			client.emailDraft.findMany({
				where: { id: { in: byType("EMAIL_DRAFT") } },
				select: { id: true, subject: true },
			}),
			client.workItem.findMany({
				where: { id: { in: byType("WORK_ITEM") } },
				select: { id: true, primaryAction: true },
			}),
			client.customerAccount.findMany({
				where: { id: { in: byType("CUSTOMER_ACCOUNT") } },
				select: { id: true, name: true },
			}),
			client.customerInstance.findMany({
				where: { id: { in: byType("CUSTOMER_INSTANCE") } },
				select: { id: true, name: true },
			}),
			client.providerAccount.findMany({
				where: { id: { in: byType("PROVIDER_ACCOUNT") } },
				select: { id: true, displayName: true, provider: true },
			}),
			client.campaign.findMany({
				where: { id: { in: byType("CAMPAIGN") } },
				select: { id: true, name: true },
			}),
			client.contentItem.findMany({
				where: { id: { in: byType("CONTENT_ITEM") } },
				select: { id: true, title: true, kind: true },
			}),
			client.contentVariant.findMany({
				where: { id: { in: byType("CONTENT_VARIANT") } },
				select: { id: true, key: true, channel: true },
			}),
			client.experiment.findMany({
				where: { id: { in: byType("EXPERIMENT") } },
				select: { id: true, name: true },
			}),
			client.socialMention.findMany({
				where: { id: { in: byType("SOCIAL_MENTION") } },
				select: {
					id: true,
					platform: true,
					authorName: true,
					externalId: true,
				},
			}),
			client.supportCase.findMany({
				where: { id: { in: byType("SUPPORT_CASE") } },
				select: { id: true, title: true },
			}),
			client.providerResource.findMany({
				where: { id: { in: byType("PROVIDER_RESOURCE") } },
				select: { id: true, name: true, resourceType: true, externalId: true },
			}),
			client.plan.findMany({
				where: { id: { in: byType("PLAN") } },
				select: { id: true, summary: true },
			}),
			client.controlCommand.findMany({
				where: { id: { in: byType("CONTROL_COMMAND") } },
				select: { id: true, command: true },
			}),
			client.providerOperation.findMany({
				where: { id: { in: byType("PROVIDER_OPERATION") } },
				select: { id: true, operation: true },
			}),
		]);

		const labels = new Map<string, string>();
		for (const row of workspaces) labels.set(`WORKSPACE:${row.id}`, row.name);
		for (const row of users) labels.set(`USER:${row.user.id}`, row.user.name);
		for (const row of companies) labels.set(`COMPANY:${row.id}`, row.name);
		for (const row of contacts) {
			labels.set(
				`CONTACT:${row.id}`,
				contactLabel(row.firstName, row.lastName),
			);
		}
		for (const row of prospects) {
			labels.set(`PROSPECT:${row.id}`, row.namedPerson ?? row.companyName);
		}
		for (const row of deals) labels.set(`DEAL:${row.id}`, row.name);
		for (const row of drafts) labels.set(`EMAIL_DRAFT:${row.id}`, row.subject);
		for (const row of workItems)
			labels.set(`WORK_ITEM:${row.id}`, row.primaryAction);
		for (const row of accounts)
			labels.set(`CUSTOMER_ACCOUNT:${row.id}`, row.name);
		for (const row of instances)
			labels.set(`CUSTOMER_INSTANCE:${row.id}`, row.name);
		for (const row of providerAccounts) {
			labels.set(
				`PROVIDER_ACCOUNT:${row.id}`,
				row.displayName ?? `${row.provider} account`,
			);
		}
		for (const row of campaigns) labels.set(`CAMPAIGN:${row.id}`, row.name);
		for (const row of contentItems)
			labels.set(`CONTENT_ITEM:${row.id}`, row.title ?? row.kind);
		for (const row of contentVariants)
			labels.set(`CONTENT_VARIANT:${row.id}`, `${row.key} · ${row.channel}`);
		for (const row of experiments) labels.set(`EXPERIMENT:${row.id}`, row.name);
		for (const row of socialMentions) {
			labels.set(
				`SOCIAL_MENTION:${row.id}`,
				`${row.platform}: ${row.authorName ?? row.externalId}`,
			);
		}
		for (const row of supportCases)
			labels.set(`SUPPORT_CASE:${row.id}`, row.title);
		for (const row of providerResources) {
			labels.set(
				`PROVIDER_RESOURCE:${row.id}`,
				row.name ?? `${row.resourceType}: ${row.externalId}`,
			);
		}
		for (const row of plans)
			labels.set(`PLAN:${row.id}`, row.summary ?? `Plan ${row.id}`);
		for (const row of controlCommands)
			labels.set(`CONTROL_COMMAND:${row.id}`, row.command);
		for (const row of providerOperations)
			labels.set(`PROVIDER_OPERATION:${row.id}`, row.operation);

		return values.map((ref) => ({
			...ref,
			label: labels.get(key(ref)) ?? null,
			missing: !labels.has(key(ref)),
		}));
	}
}
