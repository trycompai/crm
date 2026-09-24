import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	ingestGuyanaOpportunityInput,
	ingestGuyanaOpportunityOutput,
} from "./guyana-opportunity.contracts";
import { GuyanaOpportunityService } from "./guyana-opportunity.service";
import {
	ingestSignalInput,
	ingestSignalOutput,
	promoteSignalInput,
	promoteSignalOutput,
	qualifySignalInput,
	qualifySignalOutput,
	resolveSignalCompanyInput,
	resolveSignalCompanyOutput,
	signalCompanyCandidatesOutput,
	signalInboxInput,
	signalInboxOutput,
	signalSourceRecordInput,
} from "./ingest.contracts";
import { IngestService } from "./ingest.service";
import {
	decideOpportunityInput,
	decideOpportunityOutput,
	evaluateOpportunityInput,
	evaluateOpportunityOutput,
	opportunityReviewQueueInput,
	opportunityReviewQueueOutput,
} from "./opportunity-ops.contracts";
import { OpportunityOpsService } from "./opportunity-ops.service";
import { SignalQualificationService } from "./signal-qualification.service";

@Router({ alias: "ingest" })
@UseMiddlewares(AuthMiddleware)
export class IngestRouter {
	constructor(
		@Inject(IngestService) private readonly ingest: IngestService,
		@Inject(SignalQualificationService)
		private readonly qualification: SignalQualificationService,
		@Inject(OpportunityOpsService)
		private readonly opportunityOps: OpportunityOpsService,
		@Inject(GuyanaOpportunityService)
		private readonly guyanaOpportunity: GuyanaOpportunityService,
	) {}

	@Mutation({
		input: ingestSignalInput,
		output: ingestSignalOutput,
		meta: restMeta("POST", "/ingest/signal", ["Ingest"]),
	})
	async signal(@Input() input: z.infer<typeof ingestSignalInput>) {
		return this.ingest.signal(input);
	}

	@Mutation({
		input: ingestGuyanaOpportunityInput,
		output: ingestGuyanaOpportunityOutput,
		meta: restMeta("POST", "/ingest/guyana/opportunities", [
			"Opportunity Ops",
			"Guyana",
		]),
	})
	async ingestGuyanaOpportunity(
		@Input() input: z.infer<typeof ingestGuyanaOpportunityInput>,
	) {
		return this.guyanaOpportunity.ingestOpportunity(input);
	}

	@Query({
		input: signalInboxInput,
		output: signalInboxOutput,
		meta: restMeta("GET", "/ingest/signals", ["Ingest"]),
	})
	async inbox(@Input() input: z.infer<typeof signalInboxInput>) {
		return this.ingest.inbox(input);
	}

	@Query({
		input: signalSourceRecordInput,
		output: signalCompanyCandidatesOutput,
		meta: restMeta(
			"GET",
			"/ingest/signals/{sourceRecordId}/company-candidates",
			["Ingest"],
		),
	})
	async companyCandidates(@Input("sourceRecordId") sourceRecordId: string) {
		return this.ingest.companyCandidates(sourceRecordId);
	}

	@Mutation({
		input: resolveSignalCompanyInput,
		output: resolveSignalCompanyOutput,
		meta: restMeta("POST", "/ingest/signals/{sourceRecordId}/resolve-company", [
			"Ingest",
		]),
	})
	async resolveCompany(
		@Input() input: z.infer<typeof resolveSignalCompanyInput>,
	) {
		return this.ingest.resolveCompany(input);
	}

	@Mutation({
		input: qualifySignalInput,
		output: qualifySignalOutput,
		meta: restMeta("POST", "/ingest/signals/{sourceRecordId}/qualify", [
			"Ingest",
		]),
	})
	async qualify(@Input() input: z.infer<typeof qualifySignalInput>) {
		return this.qualification.qualify(input);
	}

	@Mutation({
		input: evaluateOpportunityInput,
		output: evaluateOpportunityOutput,
		meta: restMeta("POST", "/ingest/opportunities/{sourceRecordId}/evaluate", [
			"Opportunity Ops",
		]),
	})
	async evaluateOpportunity(
		@Input() input: z.infer<typeof evaluateOpportunityInput>,
	) {
		return this.opportunityOps.evaluate(input);
	}

	@Mutation({
		input: decideOpportunityInput,
		output: decideOpportunityOutput,
		meta: restMeta("POST", "/ingest/opportunities/{sourceRecordId}/decision", [
			"Opportunity Ops",
		]),
	})
	async decideOpportunity(
		@Input() input: z.infer<typeof decideOpportunityInput>,
	) {
		return this.opportunityOps.decide(input);
	}

	@Query({
		input: opportunityReviewQueueInput,
		output: opportunityReviewQueueOutput,
		meta: restMeta("GET", "/ingest/opportunities/review-queue", [
			"Opportunity Ops",
		]),
	})
	async opportunityReviewQueue(
		@Input() input: z.infer<typeof opportunityReviewQueueInput>,
	) {
		return this.opportunityOps.queue(input);
	}

	@Mutation({
		input: promoteSignalInput,
		output: promoteSignalOutput,
		meta: restMeta("POST", "/ingest/signals/{sourceRecordId}/promote", [
			"Ingest",
		]),
	})
	async promote(@Input() input: z.infer<typeof promoteSignalInput>) {
		return this.qualification.promote(input);
	}
}
